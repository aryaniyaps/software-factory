import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBuildActivities } from "../../src/temporal/activities/build.js";
import { buildProvenance, signProvenance } from "../../src/security/provenance.js";

describe("build activities", () => {
  it("runs checks inside Crabbox and bounds output", async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), "sf-checks-"));
    await writeFile(join(worktreePath, "package.json"), JSON.stringify({ name: "app", scripts: { test: "vitest run" } }));
    const calls: string[] = [];
    const activities = createBuildActivities({
      runtime: { createForWorktree: async () => ({ exec: async () => { calls.push("exec"); return { exitCode: 0, stdout: "123456", stderr: "" }; }, close: async () => { calls.push("close"); } }) },
      builder: { build: async () => signedArtifact(`registry/app@sha256:${"a".repeat(64)}`) },
      maxOutputBytes: 4,
    });
    const result = await activities.runChecks({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" }, worktree: { path: worktreePath, branch: "factory/run/task/1" } });
    expect(result).toMatchObject({ passed: true, output: "1234" });
    expect(calls).toEqual(["exec", "close"]);
  });

  it("runs Go checks on the host when hostExec is configured", async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), "sf-go-checks-"));
    await writeFile(join(worktreePath, "go.mod"), "module example.com/test\n\ngo 1.22\n");
    const activities = createBuildActivities({
      runtime: {
        createForWorktree: async () => ({
          exec: async () => ({ exitCode: 1, stdout: "", stderr: "crabbox should not run go test" }),
          close: async () => {},
        }),
      },
      hostExec: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
      builder: { build: async () => signedArtifact(`registry/app@sha256:${"a".repeat(64)}`) },
    });
    const result = await activities.runChecks({
      run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" },
      worktree: { path: worktreePath, branch: "factory/run/task/1" },
    });
    expect(result).toMatchObject({ passed: true, output: "ok\n" });
  });

  it("rejects mutable or malformed artifact references", async () => {
    const activities = createBuildActivities({
      runtime: { createForWorktree: async () => ({ exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), close: async () => {} }) },
      builder: { build: async () => ({ image: "registry/app:latest", digest: "registry/app:latest", sbomSha256: "b".repeat(64), provenance: buildProvenance({ image: "registry/app:latest", digest: "registry/app:latest", sbomSha256: "b".repeat(64), sourceRevision: "rev", builtAt: "2026-08-06T00:00:00.000Z" }), provenanceSignature: "sig" }) },
    });
    await expect(activities.buildArtifact({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" }, worktree: { path: "/worktree", branch: "factory/run/task/1" } })).rejects.toThrow("immutable image digest required");
  });
});

function signedArtifact(digest: string) {
  const image = digest.split("@")[0]!;
  const provenance = buildProvenance({
    image,
    digest,
    sbomSha256: "b".repeat(64),
    sourceRevision: "factory/run/task/1",
    builtAt: "2026-08-06T00:00:00.000Z",
  });
  return {
    image,
    digest,
    sbomSha256: provenance.sbomSha256,
    provenance,
    provenanceSignature: signProvenance(provenance, "factory-dev-signing-key"),
  };
}
