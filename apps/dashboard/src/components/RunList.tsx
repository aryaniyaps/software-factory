import type { FactoryRunSummary } from "../types";
import { temporalWorkflowUrl } from "../lib/temporal";

interface RunListProps {
  runs: FactoryRunSummary[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
  loading: boolean;
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "running") return "status-running";
  if (normalized === "input_required") return "status-input_required";
  if (normalized === "succeeded") return "status-succeeded";
  if (normalized === "failed" || normalized === "rolled_back") return "status-failed";
  if (normalized === "cancelled") return "status-cancelled";
  return "status-pending";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RunList({ runs, selectedRunId, onSelect, loading }: RunListProps) {
  if (loading && runs.length === 0) {
    return (
      <div className="muted-block" aria-busy="true">
        <strong>Loading runs</strong>
        Waiting on the factory API…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="muted-block">
        <strong>Nothing needs attention</strong>
        Runs awaiting input or recently failed appear here. Browse all runs in Temporal UI.
      </div>
    );
  }

  return (
    <ul className="run-list" aria-label="Factory runs">
      {runs.map((run) => {
        const selected = selectedRunId === run.runId;
        const temporalUrl = temporalWorkflowUrl(run.runId, run.workflowId);
        return (
          <li key={run.runId}>
            <button
              type="button"
              className={`run-item${selected ? " selected" : ""}`}
              onClick={() => onSelect(run.runId)}
              aria-current={selected ? "true" : undefined}
            >
              <div className="run-item-id">{run.runId}</div>
              <div className="run-item-meta">
                <span className={`status-badge ${statusClass(run.status)}`}>{run.status}</span>
                {run.currentNode && <span>{run.currentNode}</span>}
                <span>{formatTime(run.updatedAt)}</span>
              </div>
            </button>
            {temporalUrl && (
              <a
                className="run-item-temporal-link"
                href={temporalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                Temporal
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
