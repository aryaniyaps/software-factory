import type { FactoryExecutionView } from "../types";

export function OutcomeStrip({ execution, empty = false }: { execution: FactoryExecutionView | null; empty?: boolean }) {
  if (empty || !execution) return <div className="outcome-strip is-empty"><div className="outcome-label">Outcome</div><div className="outcome-text">Select an execution to see its outcome.</div></div>;
  const recentEvents = [...execution.timeline].slice(-5).reverse();
  return <div className="outcome-strip">
    <div className="outcome-label">Outcome — {execution.status}</div>
    <div className="outcome-text">{execution.outcome.explanation}</div>
    {recentEvents.length > 0 && <><div className="outcome-label">Recent events</div><ul className="event-list">{recentEvents.map((event) => <li key={event.recordId}><span>{event.type}</span>{" · "}<span>{new Date(event.occurredAt).toLocaleTimeString()}</span></li>)}</ul></>}
  </div>;
}
