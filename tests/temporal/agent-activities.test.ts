import { describe, expect, it } from "vitest";
import { createAgentActivities } from "../../src/temporal/activities/agent.js";

describe("agent Activities", () => {
  it("passes role policy and correlation metadata to Pi", async () => {
    let received: Record<string, unknown> | undefined;
    const activities = createAgentActivities({
      run: async (input) => { received = input; return { sessionId: "session-1", text: "agent output" }; },
    });
    const result = await activities.runAgent({
      run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" },
      worktree: { path: "/worktree", branch: "factory/run/task/1" },
      role: "implement",
      input: { plan: "do it" },
    });
    expect(result).toEqual({ sessionId: "session-1", output: "agent output" });
    expect(received).toMatchObject({ role: "implement", cwd: "/worktree", metadata: { factoryRunId: "run", ticketId: "task", phaseId: "implement" } });
  });
});
