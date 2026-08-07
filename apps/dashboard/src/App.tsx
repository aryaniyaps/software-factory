import { useCallback, useEffect, useState } from "react";
import * as api from "./api/client";
import { CreateTaskForm } from "./components/CreateTaskForm";
import { OutcomeStrip } from "./components/OutcomeStrip";
import { PipelineGraph } from "./components/PipelineGraph";
import { RunList } from "./components/RunList";
import { useRunDetail, useRunsList } from "./hooks/useRuns";
import "./styles/tokens.css";
import "./styles/app.css";

export function App() {
  const { runs, error: runsError, loading: runsLoading, refresh: refreshRuns } = useRunsList(2000);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const { detail, error: detailError, loading: detailLoading, refresh: refreshDetail, isRunning } =
    useRunDetail(selectedRunId, 1500);

  useEffect(() => {
    setSelectedNode(null);
    setActionError(null);
  }, [selectedRunId]);

  const handleSelectRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
  }, []);

  const handleCreateTask = useCallback(
    async (input: { repository: string; title: string; description: string }) => {
      const { id } = await api.createTask(input);
      await refreshRuns();
      setSelectedRunId(id);
    },
    [refreshRuns],
  );

  const handleCancel = useCallback(async () => {
    if (!selectedRunId) return;
    setActionPending(true);
    setActionError(null);
    try {
      await api.cancelRun(selectedRunId);
      await Promise.all([refreshRuns(), refreshDetail()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(false);
    }
  }, [selectedRunId, refreshRuns, refreshDetail]);

  const handleRerun = useCallback(async () => {
    if (!selectedRunId || !selectedNode) return;
    setActionPending(true);
    setActionError(null);
    try {
      await api.rerunNode(selectedRunId, selectedNode);
      await Promise.all([refreshRuns(), refreshDetail()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(false);
    }
  }, [selectedRunId, selectedNode, refreshRuns, refreshDetail]);

  const error = runsError ?? detailError ?? actionError;
  const canCancel = Boolean(selectedRunId) && (isRunning || detail?.summary.status === "running");
  const canRerun = Boolean(selectedRunId && selectedNode);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Software Factory</h1>
        <span className="subtitle">Operate — local pipeline monitor</span>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar" aria-label="Tasks and runs">
          <section className="sidebar-section">
            <h2>Create task</h2>
            <CreateTaskForm onSubmit={handleCreateTask} />
          </section>
          <section className="sidebar-section sidebar-section--runs">
            <h2>Runs</h2>
            <RunList
              runs={runs}
              selectedRunId={selectedRunId}
              onSelect={handleSelectRun}
              loading={runsLoading}
            />
          </section>
        </aside>

        <main className="main">
          <div className="main-toolbar">
            <div className="run-meta">
              {selectedRunId ? (
                <>
                  <strong>{selectedRunId}</strong>
                  {detailLoading && !detail && <> · loading…</>}
                  {detail && (
                    <>
                      {" · "}
                      <span className={`status-badge status-${detail.summary.status}`}>
                        {detail.summary.status}
                      </span>
                      {detail.summary.currentNode && <> · node: {detail.summary.currentNode}</>}
                    </>
                  )}
                </>
              ) : (
                "No run selected — create a task or pick a run"
              )}
            </div>
            {selectedNode && <span className="toolbar-hint">rerun target: {selectedNode}</span>}
            <button
              type="button"
              className="btn btn-danger"
              disabled={!canCancel || actionPending}
              onClick={() => void handleCancel()}
              aria-label="Cancel selected run"
            >
              {actionPending && canCancel ? "Canceling…" : "Cancel"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!canRerun || actionPending}
              onClick={() => void handleRerun()}
              title={selectedNode ? `Rerun from ${selectedNode}` : "Select a graph node to rerun"}
              aria-label={selectedNode ? `Rerun from ${selectedNode}` : "Rerun node"}
            >
              {actionPending && canRerun ? "Signaling…" : "Rerun node"}
            </button>
          </div>

          <PipelineGraph
            graph={detail?.graph ?? null}
            currentNode={detail?.summary.currentNode}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            loading={Boolean(selectedRunId) && detailLoading && !detail}
          />

          <OutcomeStrip
            graph={detail?.graph ?? null}
            events={detail?.events ?? []}
            empty={!selectedRunId}
          />
        </main>
      </div>
    </div>
  );
}
