import type { FactorySandboxRole } from "../../security/capability-policy.js";
import {
  assertDerivedDigest,
  verifyProvenanceSignature,
  type BuildProvenance,
} from "../../security/provenance.js";
import type { BuildInput, ChecksInput, ChecksResult, ArtifactResult } from "./types.js";

export interface BuildVm {
  exec(command: string, args: string[], options?: { timeoutMs?: number; maxOutputBytes?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  close(): Promise<void>;
}

export interface BuildRuntime {
  createForWorktree(input: { path: string; sandboxProfile: string; role?: FactorySandboxRole }): Promise<BuildVm>;
}

export interface VerifiedArtifact extends ArtifactResult {
  sbomSha256: string;
  provenanceSignature: string;
  provenance: BuildProvenance;
}

export interface ArtifactBuilder {
  build(vm: BuildVm, input: BuildInput): Promise<VerifiedArtifact>;
}

export function createBuildActivities(dependencies: {
  runtime: BuildRuntime;
  builder: ArtifactBuilder;
  maxOutputBytes?: number;
  configuredDigest?: string;
  signingKey?: string;
}): {
  runChecks(input: ChecksInput): Promise<ChecksResult>;
  buildArtifact(input: BuildInput): Promise<ArtifactResult>;
} {
  const maxOutputBytes = dependencies.maxOutputBytes ?? 256_000;
  const signingKey = dependencies.signingKey ?? process.env.FACTORY_PROVENANCE_SIGNING_KEY ?? "factory-dev-signing-key";

  return {
    async runChecks(input) {
      const vm = await dependencies.runtime.createForWorktree({
        path: input.worktree.path,
        sandboxProfile: input.run.sandboxProfile,
        role: "implementer",
      });
      try {
        const result = await vm.exec("npm", ["test", "--", "--run"], { timeoutMs: 30 * 60_000, maxOutputBytes });
        return { passed: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}`.slice(0, maxOutputBytes) };
      } finally {
        await vm.close();
      }
    },
    async buildArtifact(input) {
      const vm = await dependencies.runtime.createForWorktree({
        path: input.worktree.path,
        sandboxProfile: input.run.sandboxProfile,
        role: "builder",
      });
      try {
        const artifact = await dependencies.builder.build(vm, input);
        assertDerivedDigest(artifact.digest, dependencies.configuredDigest);
        if (!verifyProvenanceSignature(artifact.provenance, artifact.provenanceSignature, signingKey)) {
          throw new Error("provenance signature verification failed");
        }
        return {
          image: artifact.image,
          digest: artifact.digest,
          sbomSha256: artifact.sbomSha256,
          provenanceSignature: artifact.provenanceSignature,
        };
      } finally {
        await vm.close();
      }
    },
  };
}
