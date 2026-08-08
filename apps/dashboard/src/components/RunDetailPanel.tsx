import { useState } from "react";
import * as api from "../api/client";
import type { RunPanelData } from "../hooks/useRunPanels";
import type { EvidenceContentView, EvidenceItemView } from "../types";

type PanelTab = "gates" | "evidence" | "scenarios" | "probes" | "deployments";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "gates", label: "Gates" },
  { id: "evidence", label: "Evidence" },
  { id: "scenarios", label: "Scenarios" },
  { id: "probes", label: "Probes" },
  { id: "deployments", label: "Deployments" },
];

interface RunDetailPanelProps {
  runId: string | null;
  data: RunPanelData | null;
  loading: boolean;
  error: string | null;
  empty?: boolean;
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

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function RunDetailPanel({ runId, data, loading, error, empty }: RunDetailPanelProps) {
  const [tab, setTab] = useState<PanelTab>("gates");

  if (empty || !runId) {
    return (
      <section className="run-detail-panel is-empty" aria-label="Run detail">
        <p className="muted-block">Select a run to inspect gates, evidence, and deployments.</p>
      </section>
    );
  }

  return (
    <section className="run-detail-panel" aria-label="Run detail">
      <div className="run-detail-tabs" role="tablist" aria-label="Run detail tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className={`run-detail-tab${tab === entry.id ? " active" : ""}`}
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {data && <span className="run-detail-tab-count">{countForTab(data, entry.id)}</span>}
          </button>
        ))}
      </div>

      <div className="run-detail-body" role="tabpanel">
        {loading && !data && <p className="muted-block" aria-busy="true">Loading run detail…</p>}
        {error && <p className="run-detail-error">{error}</p>}
        {data && (
          <>
            {tab === "gates" && <GatesTab gates={data.gates} />}
            {tab === "evidence" && <EvidenceTab items={data.evidence} />}
            {tab === "scenarios" && <ScenariosTab scenarios={data.scenarios} />}
            {tab === "probes" && <ProbesTab probes={data.probes} />}
            {tab === "deployments" && <DeploymentsTab deployments={data.deployments} />}
          </>
        )}
      </div>
    </section>
  );
}

function countForTab(data: RunPanelData, tab: PanelTab): number {
  switch (tab) {
    case "gates":
      return data.gates.length;
    case "evidence":
      return data.evidence.length;
    case "scenarios":
      return data.scenarios.length;
    case "probes":
      return data.probes.length;
    case "deployments":
      return data.deployments.length;
  }
}

function GatesTab({ gates }: { gates: RunPanelData["gates"] }) {
  if (gates.length === 0) {
    return <p className="muted-block">No gate decisions recorded for this run.</p>;
  }
  return (
    <table className="detail-table">
      <thead>
        <tr>
          <th>Gate</th>
          <th>Decision</th>
          <th>Policy</th>
          <th>Decided</th>
        </tr>
      </thead>
      <tbody>
        {gates.map((gate) => (
          <tr key={`${gate.gateId}-${gate.decidedAt}`}>
            <td>{gate.gateId}</td>
            <td>
              <span className={`status-badge decision-${gate.decision}`}>{gate.decision}</span>
            </td>
            <td>{gate.policyVersion}</td>
            <td>{formatTime(gate.decidedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EvidenceTab({ items }: { items: EvidenceItemView[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [content, setContent] = useState<EvidenceContentView | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  async function toggleItem(item: EvidenceItemView) {
    if (expandedId === item.id) {
      setExpandedId(null);
      setContent(null);
      setContentError(null);
      return;
    }
    setExpandedId(item.id);
    setContent(null);
    setContentError(null);
    setContentLoading(true);
    try {
      if (item.signedUrl) {
        setContent(await api.getEvidenceContentFromSignedUrl(item.signedUrl));
      } else {
        setContentError("No signed URL for this evidence item.");
      }
    } catch (err) {
      setContentError(err instanceof Error ? err.message : String(err));
    } finally {
      setContentLoading(false);
    }
  }

  if (items.length === 0) {
    return <p className="muted-block">No evidence items for this run.</p>;
  }

  return (
    <ul className="evidence-list">
      {items.map((item) => {
        const expanded = expandedId === item.id;
        return (
          <li key={item.id} className="evidence-item">
            <button type="button" className="evidence-item-header" onClick={() => void toggleItem(item)}>
              <span className="evidence-kind">{item.kind}</span>
              <span className="evidence-meta">{item.mediaType}</span>
              <span className="evidence-meta">{formatTime(item.createdAt)}</span>
              <span className="evidence-id">{item.id}</span>
            </button>
            {expanded && (
              <div className="evidence-item-body">
                <dl className="evidence-dl">
                  <dt>SHA-256</dt>
                  <dd>{item.sha256}</dd>
                  <dt>Producer</dt>
                  <dd>{item.producer.type}/{item.producer.id} ({item.producer.version})</dd>
                  <dt>Redaction</dt>
                  <dd>{item.redaction}</dd>
                </dl>
                {contentLoading && <p className="muted-block">Loading content…</p>}
                {contentError && <p className="run-detail-error">{contentError}</p>}
                {content && (
                  <pre className="evidence-content">{formatJson(content)}</pre>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ScenariosTab({ scenarios }: { scenarios: RunPanelData["scenarios"] }) {
  if (scenarios.length === 0) {
    return <p className="muted-block">No scenario runs for this run.</p>;
  }
  return (
    <table className="detail-table">
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Status</th>
          <th>Satisfaction</th>
          <th>Started</th>
          <th>Completed</th>
        </tr>
      </thead>
      <tbody>
        {scenarios.map((row) => (
          <tr key={`${row.scenarioId}-${row.attemptId}`}>
            <td>{row.scenarioId}</td>
            <td>{row.status}</td>
            <td>{row.satisfaction ?? "—"}</td>
            <td>{formatTime(row.startedAt)}</td>
            <td>{row.completedAt ? formatTime(row.completedAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProbesTab({ probes }: { probes: RunPanelData["probes"] }) {
  if (probes.length === 0) {
    return <p className="muted-block">No probe runs for this run.</p>;
  }
  return (
    <table className="detail-table">
      <thead>
        <tr>
          <th>Probe</th>
          <th>Status</th>
          <th>Recorded</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>
        {probes.map((row) => (
          <tr key={`${row.probeId}-${row.attemptId}`}>
            <td>{row.probeId}</td>
            <td>{row.status}</td>
            <td>{formatTime(row.recordedAt)}</td>
            <td className="detail-cell-json">{formatJson(row.summary)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeploymentsTab({ deployments }: { deployments: RunPanelData["deployments"] }) {
  if (deployments.length === 0) {
    return <p className="muted-block">No deployments for this run.</p>;
  }
  return (
    <table className="detail-table">
      <thead>
        <tr>
          <th>Profile</th>
          <th>Status</th>
          <th>Digest</th>
          <th>Updated</th>
          <th>Observations</th>
        </tr>
      </thead>
      <tbody>
        {deployments.map((row) => (
          <tr key={row.profile}>
            <td>{row.profile}</td>
            <td>{row.status}</td>
            <td className="detail-cell-mono">{row.digest.slice(0, 16)}…</td>
            <td>{formatTime(row.updatedAt)}</td>
            <td>{row.observations.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
