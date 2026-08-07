import type { RunEvent, RunGraph } from "../types";

interface OutcomeStripProps {
  graph: RunGraph | null;
  events: RunEvent[];
  empty?: boolean;
}

function outcomeLabel(graph: RunGraph): string {
  if (graph.outcome.passed) return "Passed";
  if (graph.outcome.failed) return "Failed";
  if (graph.outcome.rolledBack) return "Rolled back";
  return graph.status;
}

export function OutcomeStrip({ graph, events, empty = false }: OutcomeStripProps) {
  if (empty || !graph) {
    return (
      <div className="outcome-strip is-empty">
        <div className="outcome-label">Outcome</div>
        <div className="outcome-text">Select a run to see outcome explanation and recent events.</div>
      </div>
    );
  }

  const recentEvents = [...events].slice(-5).reverse();

  return (
    <div className="outcome-strip">
      <div className="outcome-label">Outcome — {outcomeLabel(graph)}</div>
      <div className="outcome-text">{graph.outcome.explanation || "No outcome recorded yet."}</div>
      {recentEvents.length > 0 && (
        <>
          <div className="outcome-label">Recent events</div>
          <ul className="event-list">
            {recentEvents.map((event) => (
              <li key={event.event_id}>
                <span>{event.type}</span>
                {" · "}
                <span>{new Date(event.created_at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
