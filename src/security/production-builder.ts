import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateSbomFromPackageLock, hashSbom } from "../security/sbom.js";
import {
  buildProvenance,
  extractDigestFromBuildOutput,
  signProvenance,
} from "../security/provenance.js";
import type { ArtifactBuilder, BuildVm } from "../temporal/activities/build.js";
import type { BuildInput } from "../temporal/activities/types.js";

export function createProductionArtifactBuilder(options: {
  image: string;
  signingKey: string;
}): ArtifactBuilder {
  return {
    async build(vm, input) {
      const result = await vm.exec(
        "buildctl-daemonless.sh",
        [
          "build",
          "--frontend",
          "dockerfile.v0",
          "--local",
          "context=/work/crabbox",
          "--local",
          "dockerfile=/work/crabbox",
          "--output",
          `type=image,name=${options.image},push=true`,
        ],
        { timeoutMs: 60 * 60_000 },
      );
      if (result.exitCode !== 0) throw new Error(`isolated build failed: ${result.stderr}`);
      const digest = extractDigestFromBuildOutput(result.stdout, result.stderr, options.image);
      const sbomSha256 = await readWorktreeSbomSha256(input.worktree.path);
      const provenance = buildProvenance({
        image: options.image,
        digest,
        sbomSha256,
        sourceRevision: input.worktree.branch,
        builtAt: new Date().toISOString(),
      });
      return {
        image: options.image,
        digest,
        sbomSha256,
        provenance,
        provenanceSignature: signProvenance(provenance, options.signingKey),
      };
    },
  };
}

async function readWorktreeSbomSha256(worktreePath: string): Promise<string> {
  const lockfile = JSON.parse(await readFile(join(worktreePath, "package-lock.json"), "utf8"));
  return hashSbom(generateSbomFromPackageLock(lockfile));
}
