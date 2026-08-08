import { useCallback, useEffect, useState } from "react";
import * as api from "../api/client";
import { filterInboxRuns } from "../lib/inbox";
import type { FactoryExecutionView } from "../types";
import { usePolling } from "./usePolling";

export const INBOX_POLL_MS = 10000;

export function useRunsList(intervalMs = INBOX_POLL_MS, pinnedWorkflowId?: string | null) {
  const [runs, setRuns] = useState<FactoryExecutionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setRuns(filterInboxRuns(await api.listExecutions(), pinnedWorkflowId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [pinnedWorkflowId]);
  usePolling(refresh, { intervalMs, enabled: true, pauseWhenHidden: true });
  return { runs, error, loading, refresh };
}

export function useRunDetail(workflowId: string | null, intervalMs = 1500) {
  const [detail, setDetail] = useState<FactoryExecutionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setDetail(null);
    setError(null);
    setLoading(Boolean(workflowId));
  }, [workflowId]);
  const refresh = useCallback(async () => {
    if (!workflowId) return;
    try {
      setDetail(await api.getExecution(workflowId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workflowId]);
  const isRunning = detail?.status === "running" || detail?.status === "input_required";
  usePolling(refresh, { intervalMs: isRunning ? intervalMs : intervalMs * 2, enabled: Boolean(workflowId), pauseWhenHidden: true });
  return { detail, error, loading, refresh, isRunning };
}
