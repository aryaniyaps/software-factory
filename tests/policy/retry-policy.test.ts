import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  consumeAgentAttempt,
  consumeRepairAttempt,
  decideAfterFailure,
  DEFAULT_WORKFLOW_BUDGET,
  isBudgetExhausted,
  idempotencyKey,
} from "../../src/policy/retry-policy.js";

describe("retry policy", () => {
  it("classifies policy and security failures as non-retryable", () => {
    const policy = classifyFailure(Object.assign(new Error("policy gate failed"), { name: "PolicyViolation" }));
    expect(policy.type).toBe("policy");
    expect(policy.retryable).toBe(false);

    const security = classifyFailure(Object.assign(new Error("security scan failed"), { name: "SecurityRejected" }));
    expect(security.type).toBe("security");
    expect(security.retryable).toBe(false);
  });

  it("returns fail when budget is exhausted", () => {
    const exhausted = {
      ...DEFAULT_WORKFLOW_BUDGET,
      agentAttemptsUsed: DEFAULT_WORKFLOW_BUDGET.maxAgentAttempts,
    };
    expect(isBudgetExhausted(exhausted)).toBe(true);
    expect(decideAfterFailure(
      classifyFailure(new Error("transient")),
      1,
      3,
      exhausted,
    )).toBe("fail");
  });

  it("retries transient failures until max attempts then fails", () => {
    const transient = classifyFailure(new Error("transient timeout"));
    expect(decideAfterFailure(transient, 1, 3, DEFAULT_WORKFLOW_BUDGET)).toBe("retry");
    expect(decideAfterFailure(transient, 3, 3, DEFAULT_WORKFLOW_BUDGET)).toBe("fail");
  });

  it("fails immediately on non-retryable policy failures", () => {
    const policy = classifyFailure(Object.assign(new Error("blocked"), { name: "PolicyViolation" }));
    expect(decideAfterFailure(policy, 1, 3, DEFAULT_WORKFLOW_BUDGET)).toBe("fail");
  });

  it("fails on human escalation", () => {
    const escalation = classifyFailure(Object.assign(
      new Error("plan agent escalate_to_human: need clarity"),
      { name: "HumanEscalation" },
    ));
    expect(escalation.type).toBe("budget");
    expect(escalation.code).toBe("HUMAN_ESCALATION");
    expect(decideAfterFailure(escalation, 1, 2, DEFAULT_WORKFLOW_BUDGET)).toBe("fail");
  });

  it("tracks agent and repair attempt budgets separately", () => {
    const afterAgent = consumeAgentAttempt(DEFAULT_WORKFLOW_BUDGET, 1000);
    expect(afterAgent.agentAttemptsUsed).toBe(1);
    expect(afterAgent.tokensUsed).toBe(1000);

    const afterRepair = consumeRepairAttempt(afterAgent, 500);
    expect(afterRepair.repairAttemptsUsed).toBe(1);
    expect(afterRepair.agentAttemptsUsed).toBe(2);
    expect(afterRepair.tokensUsed).toBe(1500);
  });

  it("builds stable idempotency keys per attempt", () => {
    expect(idempotencyKey("run-1", "scout", "scout-1-abc")).toBe("run-1:scout:scout-1-abc");
  });
});
