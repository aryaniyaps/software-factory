import { describe, expect, it } from "vitest";
import { BudgetMeter, budgetFromPolicy, canPassWithBudget } from "../../src/policy/budget.js";
import { TIER_POLICIES, POLICY_VERSION } from "../../src/policy/work-policy.js";

describe("budget metering", () => {
  const policy = TIER_POLICIES.T1;

  it("creates a meter from work policy limits", () => {
    const meter = new BudgetMeter(budgetFromPolicy(policy));
    expect(meter.limits.maxAgentAttempts).toBe(policy.maxAgentAttempts);
    expect(meter.limits.tokenBudget).toBe(policy.tokenBudget);
    expect(meter.usage.agentAttemptsUsed).toBe(0);
  });

  it("tracks agent, repair, wall clock and token usage", () => {
    const meter = new BudgetMeter(budgetFromPolicy(policy));
    const afterAgent = meter.consumeAgentAttempt(1200);
    expect(afterAgent.usage.agentAttemptsUsed).toBe(1);
    expect(afterAgent.usage.tokensUsed).toBe(1200);

    const afterRepair = afterAgent.consumeRepairAttempt(800);
    expect(afterRepair.usage.repairAttemptsUsed).toBe(1);
    expect(afterRepair.usage.agentAttemptsUsed).toBe(2);

    const afterWall = afterRepair.recordWallClock(60_000);
    expect(afterWall.usage.wallClockUsedMs).toBe(60_000);
  });

  it("never passes when budget is exhausted", () => {
    const meter = new BudgetMeter({
      ...budgetFromPolicy(policy),
      agentAttemptsUsed: policy.maxAgentAttempts,
      repairAttemptsUsed: 0,
      wallClockUsedMs: 0,
      tokensUsed: 0,
    });
    expect(meter.isExhausted()).toBe(true);
    expect(meter.canPass()).toBe(false);
    expect(canPassWithBudget(meter.usage, meter.limits)).toBe(false);
  });

  it("passes when budget has remaining capacity", () => {
    const meter = new BudgetMeter(budgetFromPolicy(policy));
    expect(meter.canPass()).toBe(true);
    expect(canPassWithBudget(meter.usage, meter.limits)).toBe(true);
  });

  it("exhausts on repair attempt limit", () => {
    const meter = new BudgetMeter({
      ...budgetFromPolicy(policy),
      agentAttemptsUsed: 2,
      repairAttemptsUsed: policy.maxRepairAttempts,
      wallClockUsedMs: 0,
      tokensUsed: 0,
    });
    expect(meter.isExhausted()).toBe(true);
    expect(meter.canPass()).toBe(false);
  });

  it("throws when asserting proceed on exhausted budget", () => {
    const meter = new BudgetMeter({
      ...budgetFromPolicy(policy),
      tokensUsed: policy.tokenBudget,
      agentAttemptsUsed: 0,
      repairAttemptsUsed: 0,
      wallClockUsedMs: 0,
    });
    expect(() => meter.assertCanProceed()).toThrow("budget");
  });

  it("uses policy version from work policy tier defaults", () => {
    expect(POLICY_VERSION).toMatch(/^policy\.v\d+/);
    expect(TIER_POLICIES.T3.requiredCritics).toBeGreaterThan(TIER_POLICIES.T1.requiredCritics);
  });
});
