import type { FactoryExecutionView } from "../types";

export const RECENT_FAILURE_MS = 48 * 60 * 60 * 1000;
const FAILED_STATUSES = new Set(["failed", "rolled_back"]);

export function isNeedsAttention(execution: FactoryExecutionView): boolean {
  if (execution.status === "input_required") return true;
  if (!FAILED_STATUSES.has(execution.status)) return false;
  const updated = Date.parse(execution.updatedAt);
  return Number.isNaN(updated) || Date.now() - updated < RECENT_FAILURE_MS;
}

export function filterInboxRuns(
  executions: readonly FactoryExecutionView[],
  pinnedWorkflowId?: string | null,
): FactoryExecutionView[] {
  const inbox = executions.filter(isNeedsAttention);
  if (!pinnedWorkflowId || inbox.some((execution) => execution.workflowId === pinnedWorkflowId)) return inbox;
  const pinned = executions.find((execution) => execution.workflowId === pinnedWorkflowId);
  return pinned ? [pinned, ...inbox] : inbox;
}
