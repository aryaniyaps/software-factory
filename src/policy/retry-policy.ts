import type { FailureEnvelope, FailureType } from "../contracts/failures.js";

export interface WorkflowBudget {
  maxAgentAttempts: number;
  maxRepairAttempts: number;
  wallClockBudgetMs: number;
  tokenBudget: number;
  agentAttemptsUsed: number;
  repairAttemptsUsed: number;
  wallClockUsedMs: number;
  tokensUsed: number;
}

export const DEFAULT_WORKFLOW_BUDGET: WorkflowBudget = {
  maxAgentAttempts: 12,
  maxRepairAttempts: 2,
  wallClockBudgetMs: 30 * 60 * 1000,
  tokenBudget: 500_000,
  agentAttemptsUsed: 0,
  repairAttemptsUsed: 0,
  wallClockUsedMs: 0,
  tokensUsed: 0,
};

export type RetryDecision = "retry" | "abstain" | "fail";

const NON_RETRYABLE_TYPES: readonly FailureType[] = ["policy", "security", "invalid_input"];

export function classifyFailure(error: unknown): FailureEnvelope {
  if (isFailureEnvelope(error)) return error;

  if (error instanceof Error && error.cause) {
    return classifyFailure(error.cause);
  }

  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "Error";

  if (name === "PolicyViolation" || message.includes("policy")) {
    return envelope("policy", "POLICY_VIOLATION", message, false);
  }
  if (name === "SecurityRejected" || message.includes("security")) {
    return envelope("security", "SECURITY_REJECTED", message, false);
  }
  if (name === "InvalidTask" || message.includes("invalid task")) {
    return envelope("invalid_input", "INVALID_TASK", message, false);
  }
  if (name === "BudgetExhausted" || message.includes("budget")) {
    return envelope("budget", "BUDGET_EXHAUSTED", message, false);
  }
  if (message.includes("timeout") || message.includes("transient")) {
    return envelope("transient", "TRANSIENT", message, true);
  }
  return envelope("unknown", "UNKNOWN", message, false);
}

export function isBudgetExhausted(budget: WorkflowBudget): boolean {
  return (
    budget.agentAttemptsUsed >= budget.maxAgentAttempts
    || budget.repairAttemptsUsed >= budget.maxRepairAttempts
    || budget.wallClockUsedMs >= budget.wallClockBudgetMs
    || budget.tokensUsed >= budget.tokenBudget
  );
}

export function consumeAgentAttempt(budget: WorkflowBudget, tokensUsed = 0): WorkflowBudget {
  return {
    ...budget,
    agentAttemptsUsed: budget.agentAttemptsUsed + 1,
    tokensUsed: budget.tokensUsed + tokensUsed,
  };
}

export function consumeRepairAttempt(budget: WorkflowBudget, tokensUsed = 0): WorkflowBudget {
  return {
    ...budget,
    repairAttemptsUsed: budget.repairAttemptsUsed + 1,
    agentAttemptsUsed: budget.agentAttemptsUsed + 1,
    tokensUsed: budget.tokensUsed + tokensUsed,
  };
}

export function recordWallClock(budget: WorkflowBudget, elapsedMs: number): WorkflowBudget {
  return { ...budget, wallClockUsedMs: budget.wallClockUsedMs + elapsedMs };
}

export function decideAfterFailure(
  failure: FailureEnvelope,
  attemptNumber: number,
  maxAttempts: number,
  budget: WorkflowBudget,
): RetryDecision {
  if (isBudgetExhausted(budget) || failure.type === "budget") return "abstain";
  if (!failure.retryable || NON_RETRYABLE_TYPES.includes(failure.type)) return "fail";
  if (attemptNumber >= maxAttempts) return "abstain";
  return "retry";
}

export function idempotencyKey(runId: string, node: string, attemptId: string): string {
  return `${runId}:${node}:${attemptId}`;
}

function envelope(type: FailureType, code: string, message: string, retryable: boolean): FailureEnvelope {
  return {
    schemaVersion: "failure.v1",
    type,
    code,
    message,
    retryable,
    evidenceRefs: [],
  };
}

function isFailureEnvelope(value: unknown): value is FailureEnvelope {
  return typeof value === "object" && value !== null && (value as FailureEnvelope).schemaVersion === "failure.v1";
}
