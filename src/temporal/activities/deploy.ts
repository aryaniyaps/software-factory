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

export function createDeployActivities(dependencies: { targets: Record<string, DeploymentTarget>; ssh: DeploySsh; health: DeployHealth }): { deploy(input: DeployInput): Promise<DeployResult> } {
  return {
    async deploy(input) {
      if (!digestPattern.test(input.artifact.digest)) throw new Error("immutable image digest required");
      const target = dependencies.targets[input.run.deploymentProfile];
      if (!target) throw new Error(`unknown deployment profile: ${input.run.deploymentProfile}`);
      const run = (image: string) => dependencies.ssh.run(target.host, ["docker", "pull", image])
        .then(() => dependencies.ssh.run(target.host, ["docker", "rm", "-f", "factory-app"]))
        .then(() => dependencies.ssh.run(target.host, ["docker", "run", "-d", "--name", "factory-app", image]));

      await run(input.artifact.digest);
      try {
        await dependencies.health.wait(target.healthUrl, { attempts: 3, intervalMs: 500 });
        return { deployed: true, healthUrl: target.healthUrl };
      } catch (error) {
        if (!target.previousDigest || !digestPattern.test(target.previousDigest)) throw error;
        await run(target.previousDigest);
        return { deployed: false, healthUrl: target.healthUrl };
      }
    },
  };
}
