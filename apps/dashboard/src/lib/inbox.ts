import type { FactoryRunSummary } from "../types";

/** Failed runs stay in the inbox for this long after their last update. */
export const RECENT_FAILURE_MS = 48 * 60 * 60 * 1000;

const FAILED_STATUSES = new Set(["failed", "rolled_back"]);

export function isNeedsAttention(run: FactoryRunSummary): boolean {
  if (run.status === "input_required") return true;
  if (!FAILED_STATUSES.has(run.status)) return false;
  const updated = Date.parse(run.updatedAt);
  if (Number.isNaN(updated)) return true;
  return Date.now() - updated < RECENT_FAILURE_MS;
}

export function filterInboxRuns(
  runs: readonly FactoryRunSummary[],
  pinnedRunId?: string | null,
): FactoryRunSummary[] {
  const inbox = runs.filter(isNeedsAttention);
  if (!pinnedRunId || inbox.some((run) => run.runId === pinnedRunId)) {
    return inbox;
  }
  const pinned = runs.find((run) => run.runId === pinnedRunId);
  return pinned ? [pinned, ...inbox] : inbox;
}
