import { describe, expect, it } from "vitest";
import type { AgentOutput } from "../../src/contracts/nodes.js";
import { DEFAULT_WORKFLOW_BUDGET } from "../../src/policy/retry-policy.js";
import { runRepairLoop } from "../../src/temporal/workflows/repair-loop.js";
import { succeededNodes } from "../../src/temporal/workflows/types.js";

function repairOutput(summary = "fixed"): AgentOutput {
  return {
    schemaVersion: "agent-output.v1",
    role: "repair",
    status: "succeeded",
    summary,
    evidenceRefs: ["ev-repair-1"],
    data: { summary },
  };
}

describe("repair loop characterization", () => {
  it("passes immediately when the first deterministic check succeeds", async () => {
    const result = await runRepairLoop({
      runId: "run-1",
      budget: { ...DEFAULT_WORKFLOW_BUDGET },
      maxRepairAttempts: 2,
      runChecks: async () => ({ passed: true, output: "ok" }),
      runRepair: async () => repairOutput(),
    });
    expect(result.passed).toBe(true);
    expect(result.abstained).toBe(false);
    expect(result.checksAttempts).toHaveLength(1);
    expect(result.repairAttempts).toHaveLength(0);
    expect(result.checksAttempts[0].node).toBe("deterministic_checks");
  });

  it("records bounded repair attempts with distinct check attempt ids", async () => {
    let repairCalls = 0;
    let checkCalls = 0;
    const result = await runRepairLoop({
      runId: "run-2",
      budget: { ...DEFAULT_WORKFLOW_BUDGET },
      maxRepairAttempts: 2,
      runChecks: async () => {
        checkCalls += 1;
        return { passed: checkCalls > 2, output: checkCalls > 2 ? "ok" : "fail" };
      },
      runRepair: async (attempt) => {
        repairCalls += 1;
        return repairOutput(`repair-${attempt}`);
      },
    });
    expect(result.passed).toBe(true);
    expect(repairCalls).toBe(2);
    expect(result.checksAttempts).toHaveLength(3);
    expect(result.repairAttempts).toHaveLength(2);
    expect(result.checksAttempts[0].attemptId).not.toBe(result.checksAttempts[1].attemptId);
    expect(result.repairAttempts[0].attemptId).not.toBe(result.repairAttempts[1].attemptId);
    expect(succeededNodes([...result.checksAttempts, ...result.repairAttempts])).toEqual([
      "deterministic_checks",
      "repair",
    ]);
  });

  it("abstains after the final repair attempt when checks still fail", async () => {
    const result = await runRepairLoop({
      runId: "run-3",
      budget: { ...DEFAULT_WORKFLOW_BUDGET, maxRepairAttempts: 1 },
      maxRepairAttempts: 1,
      runChecks: async () => ({ passed: false, output: "still failing" }),
      runRepair: async () => repairOutput(),
    });
    expect(result.passed).toBe(false);
    expect(result.abstained).toBe(true);
    expect(result.repairAttempts).toHaveLength(1);
    expect(result.checksAttempts).toHaveLength(2);
  });

  it("abstains when the repair budget is exhausted before another repair", async () => {
    const result = await runRepairLoop({
      runId: "run-4",
      budget: {
        ...DEFAULT_WORKFLOW_BUDGET,
        maxRepairAttempts: 2,
        repairAttemptsUsed: 2,
      },
      maxRepairAttempts: 2,
      runChecks: async () => ({ passed: false, output: "fail" }),
      runRepair: async () => repairOutput(),
    });
    expect(result.passed).toBe(false);
    expect(result.abstained).toBe(true);
    expect(result.repairAttempts).toHaveLength(0);
  });

  it("returns the latest repair output when checks eventually pass", async () => {
    let checkCalls = 0;
    const result = await runRepairLoop({
      runId: "run-5",
      budget: { ...DEFAULT_WORKFLOW_BUDGET },
      maxRepairAttempts: 2,
      runChecks: async () => {
        checkCalls += 1;
        return { passed: checkCalls > 1, output: checkCalls > 1 ? "ok" : "fail" };
      },
      runRepair: async () => repairOutput("patched"),
    });
    expect(result.passed).toBe(true);
    expect(result.repairOutput?.data).toEqual({ summary: "patched" });
  });
});
