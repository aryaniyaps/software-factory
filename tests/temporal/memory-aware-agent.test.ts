import { describe, expect, it, vi } from "vitest";
import { buildMemoryContext } from "../../src/temporal/activities/memory-context.js";
import { createAgentActivities } from "../../src/temporal/activities/agent.js";

describe("memory-aware agent Activities", () => {
  it("assembles bounded project memory before the role prompt", async () => {
    const memory = { recallProject: vi.fn().mockResolvedValue([{ text: "convention" }]), reflectProject: vi.fn().mockResolvedValue("insight"), getMentalModel: vi.fn().mockResolvedValue({ content: "architecture" }) };
    const context = await buildMemoryContext(memory, { bank: "acme-platform", role: "plan", query: "plan this change", mentalModels: ["architecture"], tags: ["project:platform"] });
    expect(context).toContain("convention");
    expect(context).toContain("insight");
    expect(context).toContain("architecture");
  });

  it("retains the completed role outcome after Pi returns", async () => {
    const calls: string[] = [];
    const activities = createAgentActivities({
      run: async () => { calls.push("pi"); return { sessionId: "session", text: JSON.stringify({ schemaVersion: "agent-output.v1", role: "plan", status: "succeeded", summary: "done", evidenceRefs: ["ev-1"], data: {} }) }; },
      memory: { buildContext: async () => "memory", retainOutcome: async () => { calls.push("retain"); } },
    });
    await activities.runAgent({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" }, worktree: { path: "/worktree", branch: "branch" }, role: "plan", input: {} });
    expect(calls).toEqual(["pi", "retain"]);
  });

  it("requests only the role mental models declared in the profile", async () => {
    const requestedModels: string[] = [];
    const activities = createAgentActivities({
      run: async () => ({ sessionId: "session", text: JSON.stringify({ schemaVersion: "agent-output.v1", role: "implement", status: "succeeded", summary: "done", evidenceRefs: ["ev-1"], data: {} }) }),
      memory: {
        buildContext: async ({ mentalModels, operations }) => {
          requestedModels.push(...mentalModels);
          expect(operations).toEqual(["recall", "retain"]);
          return "memory";
        },
        retainOutcome: async ({ operations }) => {
          expect(operations).toEqual(["recall", "retain"]);
        },
      },
    });
    await activities.runAgent({
      run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" },
      worktree: { path: "/worktree", branch: "branch" },
      role: "implement",
      input: {},
    });
    expect(requestedModels).toEqual(["repository-conventions", "test-failures"]);
  });
});
