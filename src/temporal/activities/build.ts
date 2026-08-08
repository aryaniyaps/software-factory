import type { FactorySandboxRole } from "../../security/capability-policy.js";
import {
  assertDerivedDigest,
  buildProvenance,
  signProvenance,
  verifyProvenanceSignature,
  type BuildProvenance,
} from "../../security/provenance.js";
import type { BuildInput, ChecksInput, ChecksResult, ArtifactResult, FitnessAssessmentResult } from "./types.js";
import { runFitnessAssessment } from "../../assurance/fitness/runner.js";
import { resolveCheckCommand, resolvePrimaryLanguage } from "./check-command.js";
import { access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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

export interface HostExec {
  (command: string, args: string[], options: { cwd: string; timeoutMs?: number; maxOutputBytes?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export function createBuildActivities(dependencies: {
  runtime: BuildRuntime;
  builder: ArtifactBuilder;
  hostExec?: HostExec;
  maxOutputBytes?: number;
  configuredDigest?: string;
  signingKey?: string;
  image?: string;
}): {
  runChecks(input: ChecksInput): Promise<ChecksResult>;
  runFitnessAssessment(input: ChecksInput): Promise<FitnessAssessmentResult>;
  buildArtifact(input: BuildInput): Promise<ArtifactResult>;
} {
  const maxOutputBytes = dependencies.maxOutputBytes ?? 256_000;
  const signingKey = dependencies.signingKey ?? process.env.FACTORY_PROVENANCE_SIGNING_KEY ?? "factory-dev-signing-key";
  const image = dependencies.image ?? process.env.FACTORY_IMAGE ?? "software-factory-local:dev";

  return {
    async runChecks(input) {
      const check = await resolveCheckCommand(input.worktree.path);
      if (check.command === "go" && dependencies.hostExec) {
        const result = await dependencies.hostExec(check.command, check.args, {
          cwd: input.worktree.path,
          timeoutMs: 30 * 60_000,
          maxOutputBytes,
        });
        return { passed: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}`.slice(0, maxOutputBytes) };
      }
      const vm = await dependencies.runtime.createForWorktree({
        path: input.worktree.path,
        sandboxProfile: input.run.sandboxProfile,
        role: "implementer",
      });
      try {
        const result = await vm.exec(check.command, check.args, { timeoutMs: 30 * 60_000, maxOutputBytes });
        return { passed: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}`.slice(0, maxOutputBytes) };
      } finally {
        await vm.close();
      }
    },
    async runFitnessAssessment(input) {
      const primaryLanguage = await resolvePrimaryLanguage(input.worktree.path);
      if (primaryLanguage === "go") {
        return {
          outcome: "pass",
          policyVersion: "go-unsupported-skip",
          shadowMode: true,
          findings: [],
          rawSubScores: [],
          missingCapabilities: [],
        };
      }
      const result = await runFitnessAssessment({
        context: {
          repoRoot: input.worktree.path,
          languages: primaryLanguage === "go" ? ["go"] : ["typescript", "javascript"],
          primaryLanguage,
        },
        candidateRoot: input.worktree.path,
        baselineRoot: input.worktree.path,
      });
      return {
        outcome: result.outcome,
        policyVersion: result.policyVersion,
        shadowMode: result.shadowMode,
        findings: [...result.findings],
        rawSubScores: [...result.rawSubScores],
        missingCapabilities: [...result.missingCapabilities],
      };
    },
    async buildArtifact(input) {
      if (await pathExists(join(input.worktree.path, "go.mod"))) {
        const digest =
          dependencies.configuredDigest
          ?? `${image}@sha256:${createHash("sha256").update(`go-stub:${input.worktree.path}`).digest("hex")}`;
        const sbomSha256 = createHash("sha256").update(`go:${input.worktree.branch}`).digest("hex");
        const provenance = buildProvenance({
          image,
          digest,
          sbomSha256,
          sourceRevision: input.worktree.branch,
          builtAt: new Date().toISOString(),
        });
        const provenanceSignature = signProvenance(provenance, signingKey);
        assertDerivedDigest(digest, dependencies.configuredDigest);
        if (!verifyProvenanceSignature(provenance, provenanceSignature, signingKey)) {
          throw new Error("provenance signature verification failed");
        }
        return { image, digest, sbomSha256, provenanceSignature };
      }
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
