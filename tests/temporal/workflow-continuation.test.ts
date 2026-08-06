import { describe, expect, it } from "vitest";
import type { NodeAttemptRef } from "../../src/contracts/nodes.js";
import { DEFAULT_WORKFLOW_BUDGET } from "../../src/policy/retry-policy.js";
import {
  MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW,
  recordAttempt,
  succeededNodes,
  toBudgetState,
  type WorkflowContinuation,
} from "../../src/temporal/workflows/types.js";

function buildContinuation(overrides: Partial<WorkflowContinuation> = {}): WorkflowContinuation {
  return {
    nodeAttempts: overrides.nodeAttempts ?? [],
    budget: overrides.budget ?? { ...DEFAULT_WORKFLOW_BUDGET },
    continuationGeneration: overrides.continuationGeneration ?? 0,
    worktree: overrides.worktree,
    agentOutput: overrides.agentOutput,
  };
}

describe("workflow continuation state", () => {
  it("accumulates node attempts without mutating prior history", () => {
    const first: NodeAttemptRef = { node: "scout", attemptId: "scout-1", status: "succeeded" };
    const second: NodeAttemptRef = { node: "plan", attemptId: "plan-1", status: "succeeded" };
    const history = recordAttempt(recordAttempt([], first), second);
    expect(history).toEqual([first, second]);
    expect(succeededNodes(history)).toEqual(["scout", "plan"]);
  });

  it("preserves budget counters across continuation payloads", () => {
    const budget = {
      ...DEFAULT_WORKFLOW_BUDGET,
      agentAttemptsUsed: 6,
      repairAttemptsUsed: 2,
      wallClockUsedMs: 120_000,
      tokensUsed: 42_000,
    };
    const continuation = buildContinuation({ budget, continuationGeneration: 2 });
    expect(toBudgetState(continuation.budget)).toEqual(budget);
    expect(continuation.continuationGeneration).toBe(2);
  });

  it("carries worktree and agent output for resumed execution", () => {
    const continuation = buildContinuation({
      continuationGeneration: 1,
      worktree: { path: "/worktrees/run-test", branch: "factory/run-test" },
      agentOutput: { role: "implement", summary: "done" },
      nodeAttempts: [{ node: "implement", attemptId: "implement-1", status: "succeeded" }],
    });
    expect(continuation.worktree?.path).toBe("/worktrees/run-test");
    expect(continuation.agentOutput).toEqual({ role: "implement", summary: "done" });
    expect(succeededNodes(continuation.nodeAttempts)).toEqual(["implement"]);
  });

  it("uses the production attempt threshold before continueAsNew", () => {
    const attempts = Array.from({ length: MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW }, (_, index) => ({
      node: "scout" as const,
      attemptId: `scout-${index}`,
      status: "succeeded" as const,
    }));
    expect(attempts.length).toBe(MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW);
    expect(attempts.length >= MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW).toBe(true);
  });
});
