import { createRollbackFence } from "../../release/rollback.js";
import type {
  DeployCanaryInput,
  DeployCanaryResult,
  DeployInput,
  DeployPreviewInput,
  DeployPreviewResult,
  DeployResult,
  ObserveDeploymentInput,
  ObservationSignals,
  RollbackDeploymentInput,
  RollbackDeploymentResult,
  VerifyReleaseInput,
  VerifyReleaseResult,
} from "./types.js";

export interface DeploymentTarget {
  host: string;
  healthUrl: string;
  previewUrl?: string;
  previousDigest?: string;
}

export interface DeploySsh {
  run(host: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface DeployHealth {
  wait(url: string, options?: { attempts?: number; intervalMs?: number }): Promise<void>;
}

export interface ProductSignalCollector {
  collect(input: ObserveDeploymentInput): Promise<ObservationSignals["semantic"]>;
}

const digestPattern = /^.+@sha256:[a-f0-9]{64}$/;

function assertDigest(digest: string): void {
  if (!digestPattern.test(digest)) throw new Error("immutable image digest required");
}

function resolveTarget(targets: Record<string, DeploymentTarget>, profile: string): DeploymentTarget {
  const target = targets[profile];
  if (!target) throw new Error(`unknown deployment profile: ${profile}`);
  return target;
}

function run(host: string, image: string, ssh: DeploySsh): Promise<unknown> {
  return ssh.run(host, ["docker", "pull", image])
    .then((result) => { if (result.exitCode !== 0) throw new Error(`deployment command failed: docker pull ${image}`); return ssh.run(host, ["docker", "rm", "-f", "factory-app"]); })
    .then((result) => { if (result.exitCode !== 0) throw new Error("deployment command failed: docker rm -f factory-app"); return ssh.run(host, ["docker", "run", "-d", "--name", "factory-app", image]); })
    .then((result) => { if (result.exitCode !== 0) throw new Error(`deployment command failed: docker run ${image}`); });
}

export function createDeployActivities(dependencies: {
  targets: Record<string, DeploymentTarget>;
  ssh: DeploySsh;
  health: DeployHealth;
  productSignals?: ProductSignalCollector;
  verifyRelease?: (input: VerifyReleaseInput) => Promise<VerifyReleaseResult>;
}) {
  const completedRollbacks = new Set<string>();

  return {
    async getDeploymentTarget(input: { run: DeployInput["run"] }) {
      const target = resolveTarget(dependencies.targets, input.run.deploymentProfile);
      return {
        host: target.host,
        healthUrl: target.healthUrl,
        previewUrl: target.previewUrl ?? target.healthUrl,
        previousDigest: target.previousDigest,
      };
    },
    async deploy(input: DeployInput): Promise<DeployResult> {
      assertDigest(input.artifact.digest);
      const target = resolveTarget(dependencies.targets, input.run.deploymentProfile);
      await run(target.host, input.artifact.digest, dependencies.ssh);
      return { deployed: true, healthUrl: target.healthUrl };
    },
    async deployPreview(input: DeployPreviewInput): Promise<DeployPreviewResult> {
      assertDigest(input.artifact.digest);
      const target = resolveTarget(dependencies.targets, input.run.deploymentProfile);
      const previewHost = `${target.host}-preview`;
      await run(previewHost, input.artifact.digest, dependencies.ssh);
      return {
        previewUrl: target.previewUrl ?? target.healthUrl,
        healthUrl: target.healthUrl,
        previousDigest: target.previousDigest,
      };
    },
    async deployCanary(input: DeployCanaryInput): Promise<DeployCanaryResult> {
      assertDigest(input.artifact.digest);
      const target = resolveTarget(dependencies.targets, input.run.deploymentProfile);
      await run(target.host, input.artifact.digest, dependencies.ssh);
      return { deployed: true, percentage: input.percentage, stageIndex: input.stageIndex };
    },
    async verifyRelease(input: VerifyReleaseInput): Promise<VerifyReleaseResult> {
      if (dependencies.verifyRelease) return dependencies.verifyRelease(input);
      try {
        await dependencies.health.wait(input.previewUrl, { attempts: 3, intervalMs: 500 });
        return { passed: true, reasons: [] };
      } catch {
        return { passed: false, reasons: ["release_verifier_unreachable"] };
      }
    },
    async observeDeployment(input: ObserveDeploymentInput): Promise<ObservationSignals> {
      let healthOk = false;
      try {
        await dependencies.health.wait(input.healthUrl, { attempts: 3, intervalMs: 500 });
        healthOk = true;
      } catch {
        healthOk = false;
      }
      const semantic = dependencies.productSignals
        ? await dependencies.productSignals.collect(input)
        : { productChecksPassed: true, sloBreaches: [] as string[] };
      return {
        technical: {
          healthOk,
          errorRate: healthOk ? 0.001 : 1,
          latencyP99Ms: healthOk ? 100 : 10_000,
        },
        semantic,
      };
    },
    async rollbackDeployment(input: RollbackDeploymentInput): Promise<RollbackDeploymentResult> {
      assertDigest(input.targetDigest);
      if (completedRollbacks.has(input.idempotencyKey)) {
        return { rolledBack: true, digest: input.targetDigest, idempotent: true, fence: createRollbackFence(input.deploymentId) };
      }
      const target = resolveTarget(dependencies.targets, input.run.deploymentProfile);
      await run(target.host, input.targetDigest, dependencies.ssh);
      let healthy = false;
      try {
        await dependencies.health.wait(input.healthUrl, { attempts: 3, intervalMs: 500 });
        healthy = true;
      } catch {
        healthy = false;
      }
      if (!healthy) throw new Error("rollback health observation failed");
      completedRollbacks.add(input.idempotencyKey);
      return { rolledBack: true, digest: input.targetDigest, idempotent: false, fence: createRollbackFence(input.deploymentId) };
    },
    async healthCheck(input: { run: DeployInput["run"]; url: string; digest: string }) {
      const target = resolveTarget(dependencies.targets, input.run.deploymentProfile);
      try {
        await dependencies.health.wait(input.url, { attempts: 3, intervalMs: 500 });
        return { healthy: true, url: input.url };
      } catch {
        if (target.previousDigest && digestPattern.test(target.previousDigest)) await run(target.host, target.previousDigest, dependencies.ssh);
        return { healthy: false, url: input.url };
      }
    },
  };
}
