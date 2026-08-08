import type { FactoryExecutionView } from "../types";
import { temporalWorkflowUrl } from "../lib/temporal";

export function RunList({ runs, selectedRunId, onSelect, loading }: { runs: FactoryExecutionView[]; selectedRunId: string | null; onSelect: (workflowId: string) => void; loading: boolean }) {
  if (loading && runs.length === 0) return <div className="muted-block" aria-busy="true"><strong>Loading executions</strong>Querying Temporal visibility…</div>;
  if (runs.length === 0) return <div className="muted-block"><strong>Nothing needs attention</strong>Browse all executions in Temporal UI.</div>;
  return <ul className="run-list" aria-label="Factory executions">{runs.map((run) => {
    const selected = selectedRunId === run.workflowId;
    const temporalUrl = temporalWorkflowUrl(run.runId, run.workflowId);
    return <li key={run.workflowId}><button type="button" className={`run-item${selected ? " selected" : ""}`} onClick={() => onSelect(run.workflowId)} aria-current={selected ? "true" : undefined}><div className="run-item-id">{run.workflowId}</div><div className="run-item-meta"><span className={`status-badge status-${run.status}`}>{run.status}</span>{run.currentNode && <span>{run.currentNode}</span>}<span>{new Date(run.updatedAt).toLocaleString()}</span></div></button>{temporalUrl && <a className="run-item-temporal-link" href={temporalUrl} target="_blank" rel="noopener noreferrer">Temporal</a>}</li>;
  })}</ul>;
}
