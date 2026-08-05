import type { BuildInput, ChecksInput, ChecksResult, ArtifactResult } from "./types.js";

export interface BuildVm {
  exec(command: string, args: string[], options?: { timeoutMs?: number; maxOutputBytes?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  close(): Promise<void>;
}

export interface BuildRuntime {
  createForWorktree(input: { path: string; sandboxProfile: string }): Promise<BuildVm>;
}

export interface ArtifactBuilder {
  build(vm: BuildVm, input: BuildInput): Promise<ArtifactResult>;
}

export function createBuildActivities(dependencies: { runtime: BuildRuntime; builder: ArtifactBuilder; maxOutputBytes?: number }): {
  runChecks(input: ChecksInput): Promise<ChecksResult>;
  buildArtifact(input: BuildInput): Promise<ArtifactResult>;
} {
  const maxOutputBytes = dependencies.maxOutputBytes ?? 256_000;
  return {
    async runChecks(input) {
      const vm = await dependencies.runtime.createForWorktree({ path: input.worktree.path, sandboxProfile: input.run.sandboxProfile });
      try {
        const result = await vm.exec("npm", ["test", "--", "--run"], { timeoutMs: 30 * 60_000, maxOutputBytes });
        return { passed: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}`.slice(0, maxOutputBytes) };
      } finally {
        await vm.close();
      }
    },
    async buildArtifact(input) {
      const vm = await dependencies.runtime.createForWorktree({ path: input.worktree.path, sandboxProfile: input.run.sandboxProfile });
      try {
        const artifact = await dependencies.builder.build(vm, input);
        if (!/^.+@sha256:[a-f0-9]{64}$/.test(artifact.digest) || !artifact.image) throw new Error("immutable image digest required");
        return artifact;
      } finally {
        await vm.close();
      }
    },
  };
}
