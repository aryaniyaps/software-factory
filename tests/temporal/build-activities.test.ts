import { describe, expect, it } from "vitest";
import { createBuildActivities } from "../../src/temporal/activities/build.js";

describe("build activities", () => {
  it("runs checks inside Gondolin and bounds output", async () => {
    const calls: string[] = [];
    const activities = createBuildActivities({
      runtime: { createForWorktree: async () => ({ exec: async () => { calls.push("exec"); return { exitCode: 0, stdout: "123456", stderr: "" }; }, close: async () => { calls.push("close"); } }) },
      builder: { build: async () => ({ image: "registry/app", digest: `registry/app@sha256:${"a".repeat(64)}` }) },
      maxOutputBytes: 4,
    });
    const result = await activities.runChecks({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "gondolin" }, worktree: { path: "/worktree", branch: "factory/run/task/1" } });
    expect(result).toMatchObject({ passed: true, output: "1234" });
    expect(calls).toEqual(["exec", "close"]);
  });

  it("rejects mutable or malformed artifact references", async () => {
    const activities = createBuildActivities({
      runtime: { createForWorktree: async () => ({ exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), close: async () => {} }) },
      builder: { build: async () => ({ image: "registry/app:latest", digest: "registry/app:latest" }) },
    });
    await expect(activities.buildArtifact({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "gondolin" }, worktree: { path: "/worktree", branch: "factory/run/task/1" } })).rejects.toThrow("immutable image digest");
  });
});
