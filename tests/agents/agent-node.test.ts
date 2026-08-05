import { describe, expect, it } from "vitest";
import { createAgentNode, type AgentRunner } from "../../src/agents/agent-node.js";
import { toolsForRole } from "../../src/agents/tool-policy.js";

describe("agent node", () => {
  it("passes predecessor context and correlation metadata to the runner", async () => {
    let received: { prompt: string; cwd: string; metadata: Record<string, string> } | undefined;
    const runner: AgentRunner = {
      run: async (input) => {
        received = input;
        return { sessionId: "session-1", text: JSON.stringify({ status: "success", summary: "done", artifacts: [], notesForNextNode: "" }) };
      },
    };
    const node = createAgentNode(runner, "implement");
    const output = await node.run({ previous: "plan" }, { runId: "run-1", ticketId: "ticket-1", attemptId: "attempt-1", worktreePath: "/tmp/worktree" });

    expect(output.sessionId).toBe("session-1");
    expect(received).toMatchObject({ cwd: "/tmp/worktree", metadata: { factoryRunId: "run-1", ticketId: "ticket-1" } });
    expect(received?.prompt).toContain('"previous":"plan"');
  });

  it("rejects malformed agent envelopes", async () => {
    const runner: AgentRunner = { run: async () => ({ sessionId: "session-1", text: "not json" }) };
    await expect(createAgentNode(runner, "review").run({}, { runId: "run", ticketId: "ticket", attemptId: "attempt", worktreePath: "/tmp" })).rejects.toThrow("invalid agent envelope");
  });

  it("limits tools by phase", () => {
    expect(toolsForRole("scout")).toEqual(["read", "grep", "find", "bash", "context7", "web_search"]);
    expect(toolsForRole("review")).toEqual(["read", "grep", "find", "bash"]);
    expect(toolsForRole("deploy")).toEqual([]);
  });
});
