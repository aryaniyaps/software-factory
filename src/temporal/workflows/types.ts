import type { FactoryWorkflowInput } from "../client.js";
import {
  FACTORY_NODE_NAMES,
  type FactoryNodeName,
  type FactoryRunState,
  type NodeAttemptRef,
  type WorkflowBudgetState,
} from "../../contracts/nodes.js";
import type { WorkflowBudget } from "../../policy/retry-policy.js";
import type { ExecutionRecord } from "../../contracts/execution.js";

export type FactoryWorkflowState = FactoryRunState;
export { FACTORY_NODE_NAMES };
export type { FactoryNodeName, FactoryWorkflowInput, NodeAttemptRef, WorkflowBudgetState };

export interface WorkflowContinuation {
  nodeAttempts: readonly NodeAttemptRef[];
  executionRecords?: readonly ExecutionRecord[];
  budget: WorkflowBudget;
  continuationGeneration: number;
  worktree?: { path: string; branch: string };
  agentOutput?: object;
  baselineRevision?: string;
}

export interface FactoryWorkflowContinuationInput extends FactoryWorkflowInput {
  continuation?: WorkflowContinuation;
}

export const MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW = 40;

export function succeededNodes(nodeAttempts: readonly NodeAttemptRef[]): FactoryNodeName[] {
  const succeeded: FactoryNodeName[] = [];
  for (const attempt of nodeAttempts) {
    if (attempt.status === "succeeded" && !succeeded.includes(attempt.node)) {
      succeeded.push(attempt.node);
    }
  }
  return succeeded;
}

export function toBudgetState(budget: WorkflowBudget): WorkflowBudgetState {
  return { ...budget };
}

export function recordAttempt(
  nodeAttempts: readonly NodeAttemptRef[],
  attempt: NodeAttemptRef,
): NodeAttemptRef[] {
  return [...nodeAttempts, attempt];
}
