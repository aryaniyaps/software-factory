import { describe, expect, it } from "vitest";
import { createRepositoryActivities } from "../../src/temporal/activities/repository.js";

describe("repository activities", () => {
  it("rejects unsupported repository schemes before invoking git", async () => {
    let called = false;
    const activities = createRepositoryActivities({
      git: { prepare: async () => { called = true; return { repository: "/repo", revision: "abc" }; } },
      worktrees: { create: async () => ({ path: "/worktree", branch: "factory/run/task/1" }), remove: async () => {} },
    });
    await expect(activities.prepareRepository({ runId: "run", taskId: "task", repository: "ssh://evil/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" })).rejects.toThrow("repository must be local or HTTPS");
    expect(called).toBe(false);
  });

  it("creates distinct worktrees for concurrent attempts", async () => {
    const inputs: Array<{ repository: string; runId: string; ticketId: string; attemptId: string }> = [];
    const activities = createRepositoryActivities({
      git: { prepare: async () => ({ repository: "/repo", revision: "abc" }) },
      worktrees: { create: async (input) => { inputs.push(input); return { path: `/worktrees/${input.attemptId}`, branch: `factory/${input.attemptId}` }; }, remove: async () => {} },
    });
    const base = { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" };
    await activities.createWorktree({ ...base, preparation: { repository: "/repo", revision: "abc" }, attemptId: "1" });
    await activities.createWorktree({ ...base, preparation: { repository: "/repo", revision: "abc" }, attemptId: "2" });
    expect(inputs.map((input) => input.attemptId)).toEqual(["1", "2"]);
  });
});
