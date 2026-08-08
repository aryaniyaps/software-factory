import { useCallback, useEffect, useState } from "react";
import * as api from "./api/client";
import { CreateTaskForm } from "./components/CreateTaskForm";
import { ClarificationPanel } from "./components/ClarificationPanel";
import { OutcomeStrip } from "./components/OutcomeStrip";
import { PipelineGraph } from "./components/PipelineGraph";
import { RunList } from "./components/RunList";
import { useRunDetail, useRunsList } from "./hooks/useRuns";
import { temporalWorkflowUrl } from "./lib/temporal";
import "./styles/tokens.css";
import "./styles/app.css";
import type { ClarificationRequest, ExecutionEvent } from "./types";

export function App() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const { runs, error: runsError, loading: runsLoading, refresh: refreshRuns } =
    useRunsList(undefined, selectedWorkflowId);
  const { detail, error: detailError, loading: detailLoading, refresh: refreshDetail, isRunning } =
    useRunDetail(selectedWorkflowId, 1500);

  useEffect(() => {
    setSelectedNode(null);
    setActionError(null);
  }, [selectedWorkflowId]);

  const handleCreateTask = useCallback(async (input: { repository: string; prompt: string }) => {
    const created = await api.createExecution(input);
    await refreshRuns();
    setSelectedWorkflowId(created.workflowId);
  }, [refreshRuns]);

  const runCommand = useCallback(async (command: unknown) => {
    if (!selectedWorkflowId) return;
    setActionPending(true);
    setActionError(null);
    try {
      await api.commandExecution(selectedWorkflowId, command);
      await Promise.all([refreshRuns(), refreshDetail()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionPending(false);
    }
  }, [selectedWorkflowId, refreshRuns, refreshDetail]);

  const pendingClarification = latestPendingClarification(detail?.timeline ?? []);
  const temporalUrl = detail
    ? temporalWorkflowUrl(detail.runId, detail.workflowId)
    : selectedWorkflowId ? temporalWorkflowUrl("", selectedWorkflowId) : null;
  const error = runsError ?? detailError ?? actionError;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Software Factory</h1>
        <span className="subtitle">Temporal-owned executions and graph</span>
        {temporalUrl && <a className="header-link" href={temporalUrl} target="_blank" rel="noopener noreferrer">Open in Temporal</a>}
      </header>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="app-body">
        <aside className="sidebar" aria-label="Tasks and executions">
          <section className="sidebar-section">
            <h2>Create execution</h2>
            <CreateTaskForm onSubmit={handleCreateTask} />
          </section>
          <section className="sidebar-section sidebar-section--runs">
            <h2>Needs attention</h2>
            <RunList runs={runs} selectedRunId={selectedWorkflowId} onSelect={setSelectedWorkflowId} loading={runsLoading} />
          </section>
        </aside>
        <main className="main">
          <div className="main-toolbar">
            <div className="run-meta">
              {detail ? <><strong>{detail.workflowId}</strong>{" · "}<span className={`status-badge status-${detail.status}`}>{detail.status}</span>{detail.currentNode && <> · node: {detail.currentNode}</>}</> : selectedWorkflowId ? `${selectedWorkflowId} · loading…` : "No execution selected"}
            </div>
            {selectedNode && <span className="toolbar-hint">rerun target: {selectedNode}</span>}
            <button type="button" className="btn btn-danger" disabled={!selectedWorkflowId || !isRunning || actionPending} onClick={() => void runCommand({ type: "cancel" })}>Cancel</button>
            <button type="button" className="btn" disabled={!selectedWorkflowId || !selectedNode || actionPending} onClick={() => void runCommand({ type: "rerun_node", node: selectedNode })}>Rerun node</button>
          </div>
          <PipelineGraph graph={detail?.graph ?? null} selectedNode={selectedNode} onSelectNode={setSelectedNode} loading={Boolean(selectedWorkflowId) && detailLoading && !detail} />
          {pendingClarification && <ClarificationPanel request={pendingClarification} onAnswer={async (answer) => {
            await runCommand({
              type: "answer_clarification",
              answer: {
                schemaVersion: "clarification-answer.v1",
                requestId: pendingClarification.requestId,
                answerId: crypto.randomUUID(),
                idempotencyKey: `${pendingClarification.requestId}:${pendingClarification.stateRevision}`,
                responder: { type: "requester", id: "dashboard" },
                body: answer,
                stateRevision: pendingClarification.stateRevision,
                createdAt: new Date().toISOString(),
              },
            });
          }} />}
          <OutcomeStrip execution={detail} empty={!selectedWorkflowId} />
        </main>
      </div>
    </div>
  );
}

function latestPendingClarification(events: ExecutionEvent[]): ClarificationRequest | null {
  const answered = new Set(events.filter((event) => event.type === "clarification.answered").map((event) => (event.payload as { requestId?: string } | null)?.requestId).filter((id): id is string => Boolean(id)));
  for (const event of [...events].reverse()) {
    if (event.type !== "clarification.requested") continue;
    const request = event.payload as ClarificationRequest;
    if (request?.requestId && !answered.has(request.requestId)) return request;
  }
  return null;
}
