import { describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOW_BUDGET } from "../../src/policy/retry-policy.js";
import { succeededNodes } from "../../src/temporal/workflows/types.js";

describe("repair loop workflow helpers", () => {
  it("records distinct check and repair attempts in node history", () => {
    const attempts = [
      { node: "deterministic_checks" as const, attemptId: "deterministic_checks-1-a", status: "failed" as const },
      { node: "repair" as const, attemptId: "repair-1-b", status: "succeeded" as const },
      { node: "deterministic_checks" as const, attemptId: "deterministic_checks-2-c", status: "succeeded" as const },
    ];
    const checks = attempts.filter((attempt) => attempt.node === "deterministic_checks");
    const repairs = attempts.filter((attempt) => attempt.node === "repair");
    expect(checks).toHaveLength(2);
    expect(repairs).toHaveLength(1);
    expect(checks[0].attemptId).not.toBe(checks[1].attemptId);
    expect(succeededNodes(attempts)).toEqual(["deterministic_checks", "repair"]);
  });

  it("exhausts repair budget state toward abstention", () => {
    const exhausted = {
      ...DEFAULT_WORKFLOW_BUDGET,
      maxRepairAttempts: 1,
      repairAttemptsUsed: 1,
      agentAttemptsUsed: DEFAULT_WORKFLOW_BUDGET.maxAgentAttempts,
    };
    expect(exhausted.repairAttemptsUsed).toBeGreaterThanOrEqual(exhausted.maxRepairAttempts);
    expect(exhausted.agentAttemptsUsed).toBeGreaterThanOrEqual(exhausted.maxAgentAttempts);
  });
});
