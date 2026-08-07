import { describe, expect, it } from "vitest";
import { createAgentActivities } from "../../src/temporal/activities/agent.js";

describe("agent Activities", () => {
  it("passes role policy and correlation metadata to Pi", async () => {
    let received: Record<string, unknown> | undefined;
    const activities = createAgentActivities({
      run: async (input) => { received = input; return { sessionId: "session-1", text: JSON.stringify({ schemaVersion: "agent-output.v1", role: "implement", status: "succeeded", summary: "agent output", evidenceRefs: ["ev-1"], data: {} }) }; },
    });
    const result = await activities.runAgent({
      run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" },
      worktree: { path: "/worktree", branch: "factory/run/task/1" },
      role: "implement",
      input: { plan: "do it" },
    });
    expect(result).toMatchObject({ sessionId: "session-1", output: { role: "implement", status: "succeeded" } });
    expect(received).toMatchObject({
      role: "implement",
      cwd: "/worktree",
      metadata: {
        factory_run_id: "run",
        ticket_id: "task",
        phase_id: "implement",
        agent_role: "implement",
        session_id: "run",
        trace_id: "run:task:1",
      },
    });
  });

  it("records the complete agent turn before returning", async () => {
    const recorded: unknown[] = [];
    const activities = createAgentActivities({
      run: async () => ({
        sessionId: "session-1",
        text: JSON.stringify({
          schemaVersion: "agent-output.v1",
          role: "discovery_plan",
          status: "succeeded",
          summary: "planned",
          evidenceRefs: ["ev-1"],
          data: { steps: ["implement"] },
        }),
      }),
      sessions: {
        async recordTurn(input) {
          recorded.push(input);
        },
      },
    });

    await activities.runAgent({
      run: {
        runId: "run",
        taskId: "task",
        repository: "/repo",
        baseBranch: "main",
        workflow: "feature",
        deploymentProfile: "staging",
        sandboxProfile: "crabbox",
      },
      worktree: { path: "/worktree", branch: "factory/run/task/1" },
      role: "discovery_plan",
      input: { task: "plan it" },
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      runId: "run",
      sessionId: "session-1",
      role: "discovery_plan",
      turnIndex: 0,
      prompt: expect.stringContaining("<task>"),
      output: expect.stringContaining('"role":"discovery_plan"'),
    });
  });
});
