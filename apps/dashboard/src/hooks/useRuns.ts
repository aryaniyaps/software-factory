import { useCallback, useEffect, useState } from "react";
import * as api from "../api/client";
import { filterInboxRuns } from "../lib/inbox";
import type { FactoryRunSummary, RunEvent, RunGraph } from "../types";
import { usePolling } from "./usePolling";

/** Poll interval for the needs-attention inbox (relaxed vs full run monitor). */
export const INBOX_POLL_MS = 10000;

export interface RunDetail {
  summary: FactoryRunSummary;
  graph: RunGraph;
  events: RunEvent[];
}

export function useRunsList(intervalMs = INBOX_POLL_MS, pinnedRunId?: string | null) {
  const [runs, setRuns] = useState<FactoryRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const page = await api.listRuns(100);
      setRuns(filterInboxRuns(page.items, pinnedRunId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [pinnedRunId]);

  usePolling(refresh, { intervalMs, enabled: true, pauseWhenHidden: true });

  return { runs, error, loading, refresh };
}

export function useRunDetail(runId: string | null, intervalMs = 1500) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setLoading(Boolean(runId));
  }, [runId]);

  const refresh = useCallback(async () => {
    if (!runId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    try {
      const [summary, graph, events] = await Promise.all([
        api.getRun(runId),
        api.getRunGraph(runId),
        api.getRunEvents(runId),
      ]);
      setDetail({ summary, graph, events });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  const isRunning = detail?.summary.status === "running" || detail?.graph.status === "running";
  const pollInterval = isRunning ? intervalMs : intervalMs * 2;

  usePolling(refresh, {
    intervalMs: pollInterval,
    enabled: Boolean(runId),
    pauseWhenHidden: true,
  });

  return { detail, error, loading, refresh, isRunning };
}
