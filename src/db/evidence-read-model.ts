import type { EvidenceManifest } from "../evidence/manifest.js";
import { decodeCursor, type PageRequest } from "../api/pagination.js";

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface FactoryRunSummaryRow {
  runId: string;
  workflowId: string;
  taskId: string;
  status: string;
  currentNode?: string;
  failureReason?: string;
  updatedAt: string;
}

export interface NodeAttemptRow {
  runId: string;
  attemptId: string;
  node: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  failureCode?: string;
  evidenceManifestHash?: string;
}

export interface EvidenceItemRow {
  id: string;
  kind: string;
  schemaVersion: string;
  mediaType: string;
  sha256: string;
  uri: string;
  producerType: string;
  producerId: string;
  producerVersion: string;
  subject: Record<string, string>;
  redaction: "none" | "secrets" | "pii";
  createdAt: string;
}

export interface GateDecisionRow {
  gateId: string;
  decision: string;
  policyVersion: string;
  reasons: unknown;
  evidenceRefs: string[];
  decidedAt: string;
}

export interface ScenarioRunRow {
  scenarioId: string;
  attemptId: string;
  status: string;
  satisfaction?: number;
  startedAt: string;
  completedAt?: string;
}

export interface ProbeRunRow {
  probeId: string;
  attemptId: string;
  status: string;
  record: unknown;
  recordedAt: string;
}

export interface DeploymentRow {
  profile: string;
  digest: string;
  status: string;
  updatedAt: string;
}

export interface DeploymentObservationRow {
  profile: string;
  observationId: string;
  status: string;
  observedAt: string;
}

export interface EvidenceReadModel {
  listRuns(request: PageRequest, retentionCutoff?: Date): Promise<FactoryRunSummaryRow[]>;
  getRun(runId: string): Promise<FactoryRunSummaryRow | null>;
  listAttempts(runId: string): Promise<NodeAttemptRow[]>;
  listEvidenceItems(runId: string): Promise<EvidenceItemRow[]>;
  getEvidenceManifest(runId: string): Promise<{ manifest: EvidenceManifest; hash: string } | null>;
  listGateDecisions(runId: string): Promise<GateDecisionRow[]>;
  listScenarioRuns(runId: string): Promise<ScenarioRunRow[]>;
  listProbeRuns(runId: string): Promise<ProbeRunRow[]>;
  listDeployments(runId: string): Promise<DeploymentRow[]>;
  listDeploymentObservations(runId: string): Promise<DeploymentObservationRow[]>;
}

export function createEvidenceReadModel(db: Queryable): EvidenceReadModel {
  return {
    async listRuns(request, retentionCutoff) {
      const offset = decodeCursor(request.cursor);
      const values: unknown[] = [request.limit + 1, offset];
      let text = `SELECT run_id, workflow_id, task_id, status, current_node, failure_reason, updated_at
        FROM factory_runs`;
      if (retentionCutoff) {
        values.push(retentionCutoff.toISOString());
        text += ` WHERE updated_at >= $3`;
      }
      text += ` ORDER BY updated_at DESC, run_id OFFSET $2 LIMIT $1`;
      const result = await db.query(text, values);
      return result.rows.map(mapRunRow);
    },

    async getRun(runId) {
      const result = await db.query(
        `SELECT run_id, workflow_id, task_id, status, current_node, failure_reason, updated_at
        FROM factory_runs WHERE run_id = $1`,
        [runId],
      );
      const row = result.rows[0];
      return row ? mapRunRow(row) : null;
    },

    async listAttempts(runId) {
      const result = await db.query(
        `SELECT run_id, attempt_id, node, status, started_at, completed_at, failure_code, evidence_manifest_hash
        FROM factory_node_attempts WHERE run_id = $1 ORDER BY started_at, attempt_id`,
        [runId],
      );
      return result.rows.map(mapAttemptRow);
    },

    async listEvidenceItems(runId) {
      const result = await db.query(
        `SELECT id, kind, schema_version, media_type, sha256, uri, producer_type, producer_id, producer_version, subject, redaction, created_at
        FROM evidence_items WHERE run_id = $1 ORDER BY created_at, id`,
        [runId],
      );
      return result.rows.map(mapEvidenceRow);
    },

    async getEvidenceManifest(runId) {
      const result = await db.query(
        `SELECT manifest_hash, manifest FROM evidence_manifests WHERE run_id = $1`,
        [runId],
      );
      const row = result.rows[0] as { manifest_hash: string; manifest: EvidenceManifest } | undefined;
      if (!row) return null;
      return { hash: row.manifest_hash, manifest: row.manifest };
    },

    async listGateDecisions(runId) {
      const result = await db.query(
        `SELECT gate_id, decision, policy_version, reasons, evidence_refs, decided_at
        FROM gate_decisions WHERE run_id = $1 ORDER BY decided_at, gate_id`,
        [runId],
      );
      return result.rows.map(mapGateRow);
    },

    async listScenarioRuns(runId) {
      const result = await db.query(
        `SELECT scenario_id, attempt_id, status, satisfaction, started_at, completed_at
        FROM scenario_runs WHERE run_id = $1 ORDER BY started_at, scenario_id, attempt_id`,
        [runId],
      );
      return result.rows.map(mapScenarioRow);
    },

    async listProbeRuns(runId) {
      const result = await db.query(
        `SELECT probe_id, attempt_id, status, record, recorded_at
        FROM probe_runs WHERE run_id = $1 ORDER BY recorded_at, probe_id, attempt_id`,
        [runId],
      );
      return result.rows.map(mapProbeRow);
    },

    async listDeployments(runId) {
      const result = await db.query(
        `SELECT profile, digest, status, updated_at FROM factory_deployments WHERE run_id = $1 ORDER BY profile`,
        [runId],
      );
      return result.rows.map(mapDeploymentRow);
    },

    async listDeploymentObservations(runId) {
      const result = await db.query(
        `SELECT profile, observation_id, status, observed_at
        FROM deployment_observations WHERE run_id = $1 ORDER BY observed_at, profile, observation_id`,
        [runId],
      );
      return result.rows.map(mapObservationRow);
    },
  };
}

function mapRunRow(row: unknown): FactoryRunSummaryRow {
  const entry = row as {
    run_id: string;
    workflow_id: string;
    task_id: string;
    status: string;
    current_node: string | null;
    failure_reason: string | null;
    updated_at: string | Date;
  };
  return {
    runId: entry.run_id,
    workflowId: entry.workflow_id,
    taskId: entry.task_id,
    status: entry.status,
    currentNode: entry.current_node ?? undefined,
    failureReason: entry.failure_reason ?? undefined,
    updatedAt: toIso(entry.updated_at),
  };
}

function mapAttemptRow(row: unknown): NodeAttemptRow {
  const entry = row as {
    run_id: string;
    attempt_id: string;
    node: string;
    status: string;
    started_at: string | Date;
    completed_at: string | Date | null;
    failure_code: string | null;
    evidence_manifest_hash: string | null;
  };
  return {
    runId: entry.run_id,
    attemptId: entry.attempt_id,
    node: entry.node,
    status: entry.status,
    startedAt: toIso(entry.started_at),
    completedAt: entry.completed_at ? toIso(entry.completed_at) : undefined,
    failureCode: entry.failure_code ?? undefined,
    evidenceManifestHash: entry.evidence_manifest_hash ?? undefined,
  };
}

function mapEvidenceRow(row: unknown): EvidenceItemRow {
  const entry = row as {
    id: string;
    kind: string;
    schema_version: string;
    media_type: string;
    sha256: string;
    uri: string;
    producer_type: string;
    producer_id: string;
    producer_version: string;
    subject: Record<string, string>;
    redaction: "none" | "secrets" | "pii";
    created_at: string | Date;
  };
  return {
    id: entry.id,
    kind: entry.kind,
    schemaVersion: entry.schema_version,
    mediaType: entry.media_type,
    sha256: entry.sha256,
    uri: entry.uri,
    producerType: entry.producer_type,
    producerId: entry.producer_id,
    producerVersion: entry.producer_version,
    subject: entry.subject,
    redaction: entry.redaction,
    createdAt: toIso(entry.created_at),
  };
}

function mapGateRow(row: unknown): GateDecisionRow {
  const entry = row as {
    gate_id: string;
    decision: string;
    policy_version: string;
    reasons: unknown;
    evidence_refs: string[];
    decided_at: string | Date;
  };
  return {
    gateId: entry.gate_id,
    decision: entry.decision,
    policyVersion: entry.policy_version,
    reasons: entry.reasons,
    evidenceRefs: entry.evidence_refs,
    decidedAt: toIso(entry.decided_at),
  };
}

function mapScenarioRow(row: unknown): ScenarioRunRow {
  const entry = row as {
    scenario_id: string;
    attempt_id: string;
    status: string;
    satisfaction: number | null;
    started_at: string | Date;
    completed_at: string | Date | null;
  };
  return {
    scenarioId: entry.scenario_id,
    attemptId: entry.attempt_id,
    status: entry.status,
    satisfaction: entry.satisfaction ?? undefined,
    startedAt: toIso(entry.started_at),
    completedAt: entry.completed_at ? toIso(entry.completed_at) : undefined,
  };
}

function mapProbeRow(row: unknown): ProbeRunRow {
  const entry = row as {
    probe_id: string;
    attempt_id: string;
    status: string;
    record: unknown;
    recorded_at: string | Date;
  };
  return {
    probeId: entry.probe_id,
    attemptId: entry.attempt_id,
    status: entry.status,
    record: entry.record,
    recordedAt: toIso(entry.recorded_at),
  };
}

function mapDeploymentRow(row: unknown): DeploymentRow {
  const entry = row as {
    profile: string;
    digest: string;
    status: string;
    updated_at: string | Date;
  };
  return {
    profile: entry.profile,
    digest: entry.digest,
    status: entry.status,
    updatedAt: toIso(entry.updated_at),
  };
}

function mapObservationRow(row: unknown): DeploymentObservationRow {
  const entry = row as {
    profile: string;
    observation_id: string;
    status: string;
    observed_at: string | Date;
  };
  return {
    profile: entry.profile,
    observationId: entry.observation_id,
    status: entry.status,
    observedAt: toIso(entry.observed_at),
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
