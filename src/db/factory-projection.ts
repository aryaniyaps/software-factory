import type { EvidenceKind, EvidenceRef } from "../contracts/evidence.js";
import type { EvidenceManifest } from "../evidence/manifest.js";
import type { FeedbackTraceability } from "../feedback/types.js";

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface FactoryRunRow {
  runId: string;
  workflowId: string;
  taskId: string;
  status: string;
  currentNode?: string;
  failureReason?: string;
}

export interface FactoryProjection {
  recordRun(input: { runId: string; workflowId: string; taskId: string; status: string; currentNode?: string; failureReason?: string }): Promise<void>;
  recordEvent(input: { runId: string; eventId: string; type: string; payload: unknown }): Promise<void>;
  recordEventOutbox(input: { runId: string; eventId: string; type: string; payload: unknown }): Promise<{ inserted: boolean }>;
  recordArtifact(input: { runId: string; digest: string; image: string }): Promise<void>;
  recordDeployment(input: { runId: string; profile: string; digest: string; status: string }): Promise<void>;
  recordEvidenceItem(input: {
    runId: string;
    id: string;
    kind: EvidenceKind;
    schemaVersion: string;
    mediaType: string;
    sha256: string;
    uri: string;
    producer: { type: string; id: string; version: string };
    subject: Record<string, string>;
    createdAt: string;
    redaction: "none" | "secrets" | "pii";
  }): Promise<void>;
  recordGateDecision(input: {
    runId: string;
    gateId: string;
    decision: string;
    policyVersion: string;
    reasons: unknown;
    evidenceRefs: readonly string[];
    decidedAt?: string;
  }): Promise<void>;
  recordEvidenceManifest(input: { runId: string; manifest: EvidenceManifest; hash: string }): Promise<void>;
  recordScenarioRun(input: {
    runId: string;
    scenarioId: string;
    attemptId: string;
    status: string;
    satisfaction?: number;
    trajectoryUri?: string;
    trajectorySha256?: string;
    startedAt: string;
    completedAt?: string;
  }): Promise<void>;
  recordProbeRun(input: {
    runId: string;
    probeId: string;
    attemptId: string;
    status: string;
    record: unknown;
    recordedAt?: string;
  }): Promise<void>;
  listEvidenceItemIds(runId: string): Promise<string[]>;
  listGateDecisionKeys(runId: string): Promise<string[]>;
  listScenarioRunKeys(runId: string): Promise<string[]>;
  recordFeedbackItem(input: { runId: string; feedbackId: string; source: string; summary: string }): Promise<{ inserted: boolean }>;
  recordIncidentLink(input: { runId: string; incidentId: string; source: string }): Promise<{ inserted: boolean }>;
  recordOracleCalibration(input: {
    runId: string;
    oracleId: string;
    calibrationId: string;
    score: number;
    reportUri?: string;
    reportSha256?: string;
  }): Promise<void>;
  getFeedbackTraceability(feedbackId: string): Promise<FeedbackTraceability | null>;
  getRun(runId: string): Promise<FactoryRunRow | null>;
}

export function createFactoryProjection(db: Queryable): FactoryProjection {
  return {
    async recordRun(input) {
      await db.query(
        `INSERT INTO factory_runs (run_id, workflow_id, task_id, status, current_node, failure_reason, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (run_id) DO UPDATE SET workflow_id = EXCLUDED.workflow_id, task_id = EXCLUDED.task_id, status = EXCLUDED.status, current_node = EXCLUDED.current_node, failure_reason = EXCLUDED.failure_reason, updated_at = now()`,
        [input.runId, input.workflowId, input.taskId, input.status, input.currentNode ?? null, input.failureReason ?? null],
      );
    },

    async recordEvent(input) {
      await db.query(
        `INSERT INTO factory_events (run_id, event_id, type, payload)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (run_id, event_id) DO NOTHING`,
        [input.runId, input.eventId, input.type, input.payload],
      );
    },

    async recordEventOutbox(input) {
      await db.query("BEGIN");
      try {
        const outbox = await db.query(
          `INSERT INTO factory_event_outbox (run_id, event_id, type, payload)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (run_id, event_id) DO NOTHING
          RETURNING event_id`,
          [input.runId, input.eventId, input.type, input.payload],
        );
        const inserted = outbox.rows.length > 0;
        if (inserted) {
          await db.query(
            `INSERT INTO factory_events (run_id, event_id, type, payload)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (run_id, event_id) DO NOTHING`,
            [input.runId, input.eventId, input.type, input.payload],
          );
        }
        await db.query("COMMIT");
        return { inserted };
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    },

    async recordArtifact(input) {
      await db.query(
        `INSERT INTO factory_artifacts (run_id, digest, image)
        VALUES ($1, $2, $3)
        ON CONFLICT (run_id, digest) DO UPDATE SET image = EXCLUDED.image`,
        [input.runId, input.digest, input.image],
      );
    },

    async recordDeployment(input) {
      await db.query(
        `INSERT INTO factory_deployments (run_id, profile, digest, status, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (run_id, profile) DO UPDATE SET digest = EXCLUDED.digest, status = EXCLUDED.status, updated_at = now()`,
        [input.runId, input.profile, input.digest, input.status],
      );
    },

    async recordEvidenceItem(input) {
      await db.query(
        `INSERT INTO evidence_items (run_id, id, kind, schema_version, media_type, sha256, uri, producer_type, producer_id, producer_version, subject, redaction, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (run_id, id) DO NOTHING`,
        [
          input.runId,
          input.id,
          input.kind,
          input.schemaVersion,
          input.mediaType,
          input.sha256,
          input.uri,
          input.producer.type,
          input.producer.id,
          input.producer.version,
          input.subject,
          input.redaction,
          input.createdAt,
        ],
      );
    },

    async recordGateDecision(input) {
      const decidedAt = input.decidedAt ?? new Date().toISOString();
      await db.query(
        `INSERT INTO gate_decisions (run_id, gate_id, decision, policy_version, reasons, evidence_refs, decided_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (run_id, gate_id, decided_at) DO NOTHING`,
        [input.runId, input.gateId, input.decision, input.policyVersion, input.reasons, input.evidenceRefs, decidedAt],
      );
    },

    async recordEvidenceManifest(input) {
      await db.query(
        `INSERT INTO evidence_manifests (run_id, manifest_hash, manifest, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (run_id) DO UPDATE SET manifest_hash = EXCLUDED.manifest_hash, manifest = EXCLUDED.manifest, updated_at = now()`,
        [input.runId, input.hash, input.manifest],
      );
    },

    async recordScenarioRun(input) {
      await db.query(
        `INSERT INTO scenario_runs (run_id, scenario_id, attempt_id, status, satisfaction, trajectory_uri, trajectory_sha256, started_at, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (run_id, scenario_id, attempt_id) DO UPDATE SET
          status = EXCLUDED.status,
          satisfaction = EXCLUDED.satisfaction,
          trajectory_uri = EXCLUDED.trajectory_uri,
          trajectory_sha256 = EXCLUDED.trajectory_sha256,
          completed_at = EXCLUDED.completed_at`,
        [
          input.runId,
          input.scenarioId,
          input.attemptId,
          input.status,
          input.satisfaction ?? null,
          input.trajectoryUri ?? null,
          input.trajectorySha256 ?? null,
          input.startedAt,
          input.completedAt ?? null,
        ],
      );
    },

    async recordProbeRun(input) {
      const recordedAt = input.recordedAt ?? new Date().toISOString();
      await db.query(
        `INSERT INTO probe_runs (run_id, probe_id, attempt_id, status, record, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (run_id, probe_id, attempt_id) DO UPDATE SET
          status = EXCLUDED.status,
          record = EXCLUDED.record,
          recorded_at = EXCLUDED.recorded_at`,
        [input.runId, input.probeId, input.attemptId, input.status, input.record, recordedAt],
      );
    },

    async listEvidenceItemIds(runId) {
      const result = await db.query(
        `SELECT id FROM evidence_items WHERE run_id = $1 ORDER BY created_at, id`,
        [runId],
      );
      return result.rows.map((row) => (row as { id: string }).id);
    },

    async listGateDecisionKeys(runId) {
      const result = await db.query(
        `SELECT gate_id, decided_at FROM gate_decisions WHERE run_id = $1 ORDER BY decided_at, gate_id`,
        [runId],
      );
      return result.rows.map((row) => {
        const entry = row as { gate_id: string; decided_at: string };
        return `${entry.gate_id}@${entry.decided_at}`;
      });
    },

    async listScenarioRunKeys(runId) {
      const result = await db.query(
        `SELECT scenario_id, attempt_id FROM scenario_runs WHERE run_id = $1 ORDER BY started_at, scenario_id, attempt_id`,
        [runId],
      );
      return result.rows.map((row) => {
        const entry = row as { scenario_id: string; attempt_id: string };
        return `${entry.scenario_id}@${entry.attempt_id}`;
      });
    },

    async recordFeedbackItem(input) {
      const result = await db.query(
        `INSERT INTO feedback_items (run_id, feedback_id, source, summary)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (run_id, feedback_id) DO NOTHING
        RETURNING feedback_id`,
        [input.runId, input.feedbackId, input.source, input.summary],
      );
      return { inserted: result.rows.length > 0 };
    },

    async recordIncidentLink(input) {
      const result = await db.query(
        `INSERT INTO incident_links (run_id, incident_id, source)
        VALUES ($1, $2, $3)
        ON CONFLICT (run_id, incident_id) DO NOTHING
        RETURNING incident_id`,
        [input.runId, input.incidentId, input.source],
      );
      return { inserted: result.rows.length > 0 };
    },

    async recordOracleCalibration(input) {
      await db.query(
        `INSERT INTO oracle_calibrations (run_id, oracle_id, calibration_id, score, report_uri, report_sha256)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (run_id, oracle_id, calibration_id) DO NOTHING`,
        [
          input.runId,
          input.oracleId,
          input.calibrationId,
          input.score,
          input.reportUri ?? null,
          input.reportSha256 ?? null,
        ],
      );
    },

    async getFeedbackTraceability(feedbackId) {
      const feedback = await db.query(
        `SELECT f.run_id, f.feedback_id, f.source
        FROM feedback_items f
        WHERE f.feedback_id = $1
        LIMIT 1`,
        [feedbackId],
      );
      const row = feedback.rows[0] as { run_id: string; feedback_id: string; source: string } | undefined;
      if (!row) return null;

      const incident = await db.query(
        `SELECT incident_id FROM incident_links WHERE run_id = $1 ORDER BY linked_at DESC LIMIT 1`,
        [row.run_id],
      );
      const artifact = await db.query(
        `SELECT digest FROM factory_artifacts WHERE run_id = $1 ORDER BY digest LIMIT 1`,
        [row.run_id],
      );
      const deployment = await db.query(
        `SELECT digest FROM factory_deployments WHERE run_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [row.run_id],
      );
      const evidence = await db.query(
        `SELECT id, sha256, uri FROM evidence_items
        WHERE run_id = $1 AND kind = 'incident'
        ORDER BY created_at`,
        [row.run_id],
      );

      const incidentId = (incident.rows[0] as { incident_id: string } | undefined)?.incident_id;
      const artifactDigest = (artifact.rows[0] as { digest: string } | undefined)?.digest
        ?? (deployment.rows[0] as { digest: string } | undefined)?.digest;
      if (!incidentId || !artifactDigest) return null;

      const evidenceRefs: EvidenceRef[] = evidence.rows.map((entry) => {
        const item = entry as { id: string; sha256: string; uri: string };
        return {
          schemaVersion: "evidence-ref.v1",
          id: item.id,
          sha256: item.sha256,
          uri: item.uri,
        };
      });

      return {
        feedbackId: row.feedback_id,
        incidentId,
        deploymentId: `${row.run_id}-${artifactDigest}`,
        artifactDigest,
        runId: row.run_id,
        evidenceRefs,
      };
    },

    async getRun(runId) {
      const result = await db.query(
        `SELECT run_id, workflow_id, task_id, status, current_node, failure_reason FROM factory_runs WHERE run_id = $1`,
        [runId],
      );
      const row = result.rows[0] as {
        run_id: string;
        workflow_id: string;
        task_id: string;
        status: string;
        current_node: string | null;
        failure_reason: string | null;
      } | undefined;
      if (!row) return null;
      return {
        runId: row.run_id,
        workflowId: row.workflow_id,
        taskId: row.task_id,
        status: row.status,
        currentNode: row.current_node ?? undefined,
        failureReason: row.failure_reason ?? undefined,
      };
    },
  };
}
