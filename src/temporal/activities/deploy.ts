import type { DeployInput, DeployResult } from "./types.js";

export interface DeploymentTarget {
  host: string;
  healthUrl: string;
  previousDigest?: string;
}

export interface DeploySsh {
  run(host: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface DeployHealth {
  wait(url: string, options?: { attempts?: number; intervalMs?: number }): Promise<void>;
}

const digestPattern = /^.+@sha256:[a-f0-9]{64}$/;

function run(host: string, image: string, ssh: DeploySsh): Promise<unknown> {
  return ssh.run(host, ["docker", "pull", image])
    .then((result) => { if (result.exitCode !== 0) throw new Error(`deployment command failed: docker pull ${image}`); return ssh.run(host, ["docker", "rm", "-f", "factory-app"]); })
    .then((result) => { if (result.exitCode !== 0) throw new Error("deployment command failed: docker rm -f factory-app"); return ssh.run(host, ["docker", "run", "-d", "--name", "factory-app", image]); })
    .then((result) => { if (result.exitCode !== 0) throw new Error(`deployment command failed: docker run ${image}`); });
}

export function createDeployActivities(dependencies: { targets: Record<string, DeploymentTarget>; ssh: DeploySsh; health: DeployHealth }): { deploy(input: DeployInput): Promise<DeployResult>; healthCheck(input: { run: DeployInput["run"]; url: string; digest: string }): Promise<{ healthy: boolean; url: string }> } {
  return {
    async deploy(input) {
      if (!digestPattern.test(input.artifact.digest)) throw new Error("immutable image digest required");
      const target = dependencies.targets[input.run.deploymentProfile];
      if (!target) throw new Error(`unknown deployment profile: ${input.run.deploymentProfile}`);
      await run(target.host, input.artifact.digest, dependencies.ssh);
      return { deployed: true, healthUrl: target.healthUrl };
    },
    async healthCheck(input) {
      const target = dependencies.targets[input.run.deploymentProfile];
      if (!target) throw new Error(`unknown deployment profile: ${input.run.deploymentProfile}`);
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
