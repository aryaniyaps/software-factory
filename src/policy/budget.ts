import type { WorkflowBudget } from "./retry-policy.js";
import { isBudgetExhausted } from "./retry-policy.js";
import type { WorkPolicy } from "./work-policy.js";

export type BudgetLimits = Pick<
  WorkflowBudget,
  "maxAgentAttempts" | "maxRepairAttempts" | "wallClockBudgetMs" | "tokenBudget"
>;

export type BudgetUsage = Pick<
  WorkflowBudget,
  "agentAttemptsUsed" | "repairAttemptsUsed" | "wallClockUsedMs" | "tokensUsed"
>;

export interface PolicyBudget extends BudgetLimits, BudgetUsage {}

export function budgetFromPolicy(policy: WorkPolicy): PolicyBudget {
  return {
    maxAgentAttempts: policy.maxAgentAttempts,
    maxRepairAttempts: policy.maxRepairAttempts,
    wallClockBudgetMs: policy.wallClockBudgetMs,
    tokenBudget: policy.tokenBudget,
    agentAttemptsUsed: 0,
    repairAttemptsUsed: 0,
    wallClockUsedMs: 0,
    tokensUsed: 0,
  };
}

export function toWorkflowBudget(budget: PolicyBudget): WorkflowBudget {
  return { ...budget };
}

export function canPassWithBudget(usage: BudgetUsage, limits: BudgetLimits): boolean {
  return !isBudgetExhausted({ ...limits, ...usage });
}

export class BudgetMeter {
  readonly limits: BudgetLimits;
  readonly usage: BudgetUsage;

  constructor(budget: PolicyBudget) {
    this.limits = {
      maxAgentAttempts: budget.maxAgentAttempts,
      maxRepairAttempts: budget.maxRepairAttempts,
      wallClockBudgetMs: budget.wallClockBudgetMs,
      tokenBudget: budget.tokenBudget,
    };
    this.usage = {
      agentAttemptsUsed: budget.agentAttemptsUsed,
      repairAttemptsUsed: budget.repairAttemptsUsed,
      wallClockUsedMs: budget.wallClockUsedMs,
      tokensUsed: budget.tokensUsed,
    };
  }

  isExhausted(): boolean {
    return !canPassWithBudget(this.usage, this.limits);
  }

  canPass(): boolean {
    return canPassWithBudget(this.usage, this.limits);
  }

  assertCanProceed(): void {
    if (this.isExhausted()) {
      throw Object.assign(new Error("budget exhausted"), { name: "BudgetExhausted" });
    }
  }

  consumeAgentAttempt(tokensUsed = 0): BudgetMeter {
    return new BudgetMeter({
      ...this.limits,
      ...this.usage,
      agentAttemptsUsed: this.usage.agentAttemptsUsed + 1,
      tokensUsed: this.usage.tokensUsed + tokensUsed,
    });
  }

  consumeRepairAttempt(tokensUsed = 0): BudgetMeter {
    return new BudgetMeter({
      ...this.limits,
      ...this.usage,
      repairAttemptsUsed: this.usage.repairAttemptsUsed + 1,
      agentAttemptsUsed: this.usage.agentAttemptsUsed + 1,
      tokensUsed: this.usage.tokensUsed + tokensUsed,
    });
  }

  recordWallClock(elapsedMs: number): BudgetMeter {
    return new BudgetMeter({
      ...this.limits,
      ...this.usage,
      wallClockUsedMs: this.usage.wallClockUsedMs + elapsedMs,
    });
  }
}
