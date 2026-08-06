import { asc, desc, eq, gte } from "drizzle-orm";
import type { EvidenceManifest } from "../evidence/manifest.js";
import { decodeCursor, type PageRequest } from "../api/pagination.js";
import type { Database } from "./database.js";
import {
  deploymentObservations,
  evidenceItems,
  evidenceManifests,
  factoryDeployments,
  factoryNodeAttempts,
  factoryRuns,
  gateDecisions,
  probeRuns,
  scenarioRuns,
} from "./schema.js";

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

export function createEvidenceReadModel(db: Database): EvidenceReadModel {
  return {
    async listRuns(request, retentionCutoff) {
      const offset = decodeCursor(request.cursor);
      const rows = await db
        .select()
        .from(factoryRuns)
        .where(retentionCutoff ? gte(factoryRuns.updatedAt, retentionCutoff) : undefined)
        .orderBy(desc(factoryRuns.updatedAt), desc(factoryRuns.runId))
        .offset(offset)
        .limit(request.limit + 1);
      return rows.map(mapRunRow);
    },

    async getRun(runId) {
      const [row] = await db
        .select()
        .from(factoryRuns)
        .where(eq(factoryRuns.runId, runId))
        .limit(1);
      return row ? mapRunRow(row) : null;
    },

    async listAttempts(runId) {
      const rows = await db
        .select()
        .from(factoryNodeAttempts)
        .where(eq(factoryNodeAttempts.runId, runId))
        .orderBy(asc(factoryNodeAttempts.startedAt), asc(factoryNodeAttempts.attemptId));
      return rows.map(mapAttemptRow);
    },

    async listEvidenceItems(runId) {
      const rows = await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.runId, runId))
        .orderBy(asc(evidenceItems.createdAt), asc(evidenceItems.id));
      return rows.map(mapEvidenceRow);
    },

    async getEvidenceManifest(runId) {
      const [row] = await db
        .select({
          manifestHash: evidenceManifests.manifestHash,
          manifest: evidenceManifests.manifest,
        })
        .from(evidenceManifests)
        .where(eq(evidenceManifests.runId, runId))
        .limit(1);
      if (!row) return null;
      return { hash: row.manifestHash, manifest: row.manifest as EvidenceManifest };
    },

    async listGateDecisions(runId) {
      const rows = await db
        .select()
        .from(gateDecisions)
        .where(eq(gateDecisions.runId, runId))
        .orderBy(asc(gateDecisions.decidedAt), asc(gateDecisions.gateId));
      return rows.map(mapGateRow);
    },

    async listScenarioRuns(runId) {
      const rows = await db
        .select()
        .from(scenarioRuns)
        .where(eq(scenarioRuns.runId, runId))
        .orderBy(asc(scenarioRuns.startedAt), asc(scenarioRuns.scenarioId), asc(scenarioRuns.attemptId));
      return rows.map(mapScenarioRow);
    },

    async listProbeRuns(runId) {
      const rows = await db
        .select()
        .from(probeRuns)
        .where(eq(probeRuns.runId, runId))
        .orderBy(asc(probeRuns.recordedAt), asc(probeRuns.probeId), asc(probeRuns.attemptId));
      return rows.map(mapProbeRow);
    },

    async listDeployments(runId) {
      const rows = await db
        .select()
        .from(factoryDeployments)
        .where(eq(factoryDeployments.runId, runId))
        .orderBy(asc(factoryDeployments.profile));
      return rows.map(mapDeploymentRow);
    },

    async listDeploymentObservations(runId) {
      const rows = await db
        .select()
        .from(deploymentObservations)
        .where(eq(deploymentObservations.runId, runId))
        .orderBy(asc(deploymentObservations.observedAt), asc(deploymentObservations.profile), asc(deploymentObservations.observationId));
      return rows.map(mapObservationRow);
    },
  };
}

function mapRunRow(row: typeof factoryRuns.$inferSelect): FactoryRunSummaryRow {
  return {
    runId: row.runId,
    workflowId: row.workflowId,
    taskId: row.taskId,
    status: row.status,
    currentNode: row.currentNode ?? undefined,
    failureReason: row.failureReason ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAttemptRow(row: typeof factoryNodeAttempts.$inferSelect): NodeAttemptRow {
  return {
    runId: row.runId,
    attemptId: row.attemptId,
    node: row.node,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    failureCode: row.failureCode ?? undefined,
    evidenceManifestHash: row.evidenceManifestHash ?? undefined,
  };
}

function mapEvidenceRow(row: typeof evidenceItems.$inferSelect): EvidenceItemRow {
  return {
    id: row.id,
    kind: row.kind,
    schemaVersion: row.schemaVersion,
    mediaType: row.mediaType,
    sha256: row.sha256,
    uri: row.uri,
    producerType: row.producerType,
    producerId: row.producerId,
    producerVersion: row.producerVersion,
    subject: row.subject as Record<string, string>,
    redaction: row.redaction as EvidenceItemRow["redaction"],
    createdAt: row.createdAt.toISOString(),
  };
}

function mapGateRow(row: typeof gateDecisions.$inferSelect): GateDecisionRow {
  return {
    gateId: row.gateId,
    decision: row.decision,
    policyVersion: row.policyVersion,
    reasons: row.reasons,
    evidenceRefs: row.evidenceRefs as string[],
    decidedAt: row.decidedAt.toISOString(),
  };
}

function mapScenarioRow(row: typeof scenarioRuns.$inferSelect): ScenarioRunRow {
  return {
    scenarioId: row.scenarioId,
    attemptId: row.attemptId,
    status: row.status,
    satisfaction: row.satisfaction ?? undefined,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

function mapProbeRow(row: typeof probeRuns.$inferSelect): ProbeRunRow {
  return {
    probeId: row.probeId,
    attemptId: row.attemptId,
    status: row.status,
    record: row.record,
    recordedAt: row.recordedAt.toISOString(),
  };
}

function mapDeploymentRow(row: typeof factoryDeployments.$inferSelect): DeploymentRow {
  return {
    profile: row.profile,
    digest: row.digest,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapObservationRow(row: typeof deploymentObservations.$inferSelect): DeploymentObservationRow {
  return {
    profile: row.profile,
    observationId: row.observationId,
    status: row.status,
    observedAt: row.observedAt.toISOString(),
  };
}
