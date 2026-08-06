import { sleep, uuid4 } from "@temporalio/workflow";
import type { FactoryNodeName, NodeResult } from "../../contracts/nodes.js";
import type { FailureEnvelope } from "../../contracts/failures.js";
import {
  classifyFailure,
  consumeAgentAttempt,
  decideAfterFailure,
  idempotencyKey,
  isBudgetExhausted,
  recordWallClock,
  type WorkflowBudget,
} from "../../policy/retry-policy.js";
import type { NodeAttemptRef } from "./types.js";

export interface RunNodeAttemptResult<T> {
  result: NodeResult<T>;
  budget: WorkflowBudget;
  attemptRef: NodeAttemptRef;
}

export interface RunNodeWithRetryResult<T> {
  attempts: NodeResult<T>[];
  attemptRefs: NodeAttemptRef[];
  budget: WorkflowBudget;
  output?: T;
  abstained: boolean;
  failed: boolean;
}

export async function runNodeAttempt<T>(options: {
  runId: string;
  node: FactoryNodeName;
  attemptNumber: number;
  budget: WorkflowBudget;
  execute: () => Promise<T>;
  evidenceRefs?: readonly string[];
  startedAtMs?: number;
}): Promise<RunNodeAttemptResult<T>> {
  const attemptId = `${options.node}-${options.attemptNumber}-${uuid4()}`;
  const startedAt = options.startedAtMs !== undefined
    ? new Date(options.startedAtMs).toISOString()
    : new Date().toISOString();
  const key = idempotencyKey(options.runId, options.node, attemptId);

  try {
    const output = await options.execute();
    const completedAt = new Date().toISOString();
    const result: NodeResult<T> = {
      schemaVersion: "node-result.v1",
      node: options.node,
      attemptId,
      status: "succeeded",
      output,
      evidenceRefs: options.evidenceRefs ?? [`idempotency:${key}`],
      startedAt,
      completedAt,
    };
    return {
      result,
      budget: options.budget,
      attemptRef: { node: options.node, attemptId, status: "succeeded" },
    };
  } catch (error) {
    const failure = classifyFailure(error);
    const completedAt = new Date().toISOString();
    const result: NodeResult<T> = {
      schemaVersion: "node-result.v1",
      node: options.node,
      attemptId,
      status: "failed",
      evidenceRefs: failure.evidenceRefs.length > 0 ? failure.evidenceRefs : [`idempotency:${key}`],
      startedAt,
      completedAt,
      failure,
    };
    return {
      result,
      budget: options.budget,
      attemptRef: { node: options.node, attemptId, status: "failed" },
    };
  }
}

export async function runNodeWithRetry<T>(options: {
  runId: string;
  node: FactoryNodeName;
  budget: WorkflowBudget;
  maxAttempts: number;
  execute: (attemptNumber: number) => Promise<T>;
  evidenceRefs?: (output: T) => readonly string[];
  tokensUsed?: (output: T) => number;
}): Promise<RunNodeWithRetryResult<T>> {
  const attempts: NodeResult<T>[] = [];
  const attemptRefs: NodeAttemptRef[] = [];
  let budget = options.budget;
  let attemptNumber = 1;

  while (attemptNumber <= options.maxAttempts) {
    if (isBudgetExhausted(budget)) {
      return { attempts, attemptRefs, budget, abstained: true, failed: false };
    }

    const startedAtMs = Date.now();
    budget = consumeAgentAttempt(budget, 0);
    const attempt = await runNodeAttempt({
      runId: options.runId,
      node: options.node,
      attemptNumber,
      budget,
      execute: () => options.execute(attemptNumber),
      evidenceRefs: undefined,
      startedAtMs,
    });
    budget = recordWallClock(attempt.budget, Date.now() - startedAtMs);
    attempts.push(attempt.result);
    attemptRefs.push(attempt.attemptRef);

    if (attempt.result.status === "succeeded") {
      const output = attempt.result.output as T;
      const tokens = options.tokensUsed?.(output) ?? 0;
      if (tokens > 0) budget = consumeAgentAttempt(budget, tokens);
      return { attempts, attemptRefs, budget, output, abstained: false, failed: false };
    }

    const failure = attempt.result.failure as FailureEnvelope;
    const decision = decideAfterFailure(failure, attemptNumber, options.maxAttempts, budget);
    if (decision === "abstain") {
      return { attempts, attemptRefs, budget, abstained: true, failed: false };
    }
    if (decision === "fail") {
      return { attempts, attemptRefs, budget, abstained: false, failed: true };
    }

    if (failure.type === "transient") {
      await sleep("2 seconds");
    }
    attemptNumber += 1;
  }

  return { attempts, attemptRefs, budget, abstained: true, failed: false };
}
