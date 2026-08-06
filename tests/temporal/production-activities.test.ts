import { describe, expect, it } from "vitest";
import { createProductionActivities } from "../../src/temporal/activities/production.js";

describe("production activities", () => {
  it("runs agent and checks through injected execution adapters", async () => {
    const calls: string[] = [];
    const activities = createProductionActivities({
      prepareRepository: async () => ({ repository: "org/app", revision: "abc" }),
      createWorktree: async () => ({ path: "/worktree", branch: "factory/run" }),
      agentRunner: { run: async () => { calls.push("agent"); return { sessionId: "session", text: "{}" }; } },
      workspace: {
        create: async () => ({ id: "vm" }),
        exec: async () => { calls.push("check"); return { exitCode: 0, stdout: "ok", stderr: "" }; },
        destroy: async () => {},
      },
      buildArtifact: async () => ({ image: "app", digest: "app@sha256:abc" }),
      deploy: async () => { calls.push("deploy"); return { deployed: true, healthUrl: "http://app" }; },
      updateTaskStatus: async () => {},
    });
    const input = { runId: "run", taskId: "task", repository: "org/app", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" };
    const worktree = await activities.createWorktree({ ...input, preparation: { repository: "org/app", revision: "abc" } });
    await activities.runAgent({ run: input, worktree, role: "implement", input: {} });
    await activities.runChecks({ run: input, worktree });
    await activities.deploy({ run: input, artifact: { image: "app", digest: "app@sha256:abc" } });
    expect(calls).toEqual(["agent", "check", "deploy"]);
  });
});
