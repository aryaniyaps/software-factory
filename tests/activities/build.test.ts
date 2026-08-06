import { describe, expect, it } from "vitest";
import { createBuildActivities } from "../../src/temporal/activities/build.js";
import { buildProvenance, signProvenance } from "../../src/security/provenance.js";

const run = {
  runId: "run",
  taskId: "task",
  repository: "/repo",
  baseBranch: "main",
  workflow: "feature",
  deploymentProfile: "staging",
  sandboxProfile: "crabbox",
};
const worktree = { path: "/worktree", branch: "factory/run/task/1" };
const digestHex = "a".repeat(64);
const image = "registry.example/app";
const derivedDigest = `${image}@sha256:${digestHex}`;

describe("build artifact provenance", () => {
  it("rejects artifacts when configured digest differs from derived output", async () => {
    const activities = createBuildActivities({
      runtime: {
        createForWorktree: async () => ({
          exec: async () => ({ exitCode: 0, stdout: `sha256:${digestHex}`, stderr: "" }),
          close: async () => {},
        }),
      },
      builder: {
        build: async () => ({
          image,
          digest: derivedDigest,
          sbomSha256: "b".repeat(64),
          provenance: buildProvenance({
            image,
            digest: derivedDigest,
            sbomSha256: "b".repeat(64),
            sourceRevision: "rev",
            builtAt: "2026-08-06T00:00:00.000Z",
          }),
          provenanceSignature: signArtifact(derivedDigest),
        }),
      },
      configuredDigest: `${image}@sha256:${"c".repeat(64)}`,
      signingKey: "test-key",
    });

    await expect(activities.buildArtifact({ run, worktree })).rejects.toThrow("configured digest does not match derived build output");
  });

  it("returns only the verified derived digest for deployment", async () => {
    const activities = createBuildActivities({
      runtime: {
        createForWorktree: async () => ({
          exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
          close: async () => {},
        }),
      },
      builder: {
        build: async () => ({
          image,
          digest: derivedDigest,
          sbomSha256: "b".repeat(64),
          provenance: buildProvenance({
            image,
            digest: derivedDigest,
            sbomSha256: "b".repeat(64),
            sourceRevision: "rev",
            builtAt: "2026-08-06T00:00:00.000Z",
          }),
          provenanceSignature: signArtifact(derivedDigest),
        }),
      },
      signingKey: "test-key",
    });

    const artifact = await activities.buildArtifact({ run, worktree });
    expect(artifact.digest).toBe(derivedDigest);
    expect(artifact.provenanceSignature).toBeTruthy();
  });
});

function signArtifact(digest: string): string {
  return signProvenance(
    buildProvenance({
      image,
      digest,
      sbomSha256: "b".repeat(64),
      sourceRevision: "rev",
      builtAt: "2026-08-06T00:00:00.000Z",
    }),
    "test-key",
  );
}
