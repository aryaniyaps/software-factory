import type { EvidenceReadModel } from "../db/evidence-read-model.js";
import { paginate, type PageRequest } from "./pagination.js";
import { redactPayload } from "./redaction.js";
import { createSignedUrl, type SignedUrlConfig } from "./signed-urls.js";
import type {
  DeploymentView,
  EvidenceItemView,
  FactoryRunSummary,
  GateDecisionView,
  NodeAttemptView,
  ProbeRunView,
  RunGraph,
  ScenarioRunView,
} from "./evidence-schemas.js";

export interface EvidenceServiceConfig {
  readonly retentionDays: number;
  readonly signedUrls: SignedUrlConfig;
}

export interface EvidenceService {
  listRuns(request: PageRequest): Promise<ReturnType<typeof paginate<FactoryRunSummary>>>;
  getRun(runId: string): Promise<FactoryRunSummary | null>;
  getRunGraph(runId: string): Promise<RunGraph | null>;
  listAttempts(runId: string, request: PageRequest): Promise<ReturnType<typeof paginate<NodeAttemptView>>>;
  listEvidence(runId: string, request: PageRequest): Promise<ReturnType<typeof paginate<EvidenceItemView>>>;
  getEvidenceManifest(runId: string): Promise<{ schemaVersion: "evidence-manifest-view.v1"; hash: string; manifest: unknown } | null>;
  getEvidenceItem(runId: string, itemId: string): Promise<EvidenceItemView | null>;
  listGates(runId: string, request: PageRequest): Promise<ReturnType<typeof paginate<GateDecisionView>>>;
  listScenarios(runId: string, request: PageRequest): Promise<ReturnType<typeof paginate<ScenarioRunView>>>;
  listProbes(runId: string, request: PageRequest): Promise<ReturnType<typeof paginate<ProbeRunView>>>;
  listDeployments(runId: string): Promise<{ schemaVersion: "deployment-list.v1"; items: DeploymentView[] }>;
}

export function createEvidenceService(input: {
  readModel: EvidenceReadModel;
  config: EvidenceServiceConfig;
}): EvidenceService {
  const retentionCutoff = () => {
    if (input.config.retentionDays <= 0) return undefined;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - input.config.retentionDays);
    return cutoff;
  };

  const signedUrlFor = (runId: string, itemId: string) => createSignedUrl(input.config.signedUrls, {
    runId,
    itemId,
    expiresAt: Math.floor(Date.now() / 1000) + input.config.signedUrls.ttlSeconds,
  });

  return {
    async listRuns(request) {
      const rows = await input.readModel.listRuns(request, retentionCutoff());
      const summaries = rows.map(toRunSummary);
      return paginate(summaries, request);
    },

    async getRun(runId) {
      const row = await input.readModel.getRun(runId);
      return row ? toRunSummary(row) : null;
    },

    async getRunGraph(runId) {
      const run = await input.readModel.getRun(runId);
      if (!run) return null;
      const attempts = (await input.readModel.listAttempts(runId)).map(toAttemptView);
      const manifest = await input.readModel.getEvidenceManifest(runId);
      const gates = await input.readModel.listGateDecisions(runId);
      const deployments = await input.readModel.listDeployments(runId);
      const failedGates = gates.filter((gate) => gate.decision === "fail");
      const abstainedGates = gates.filter((gate) => gate.decision === "abstain");
      const rolledBack = run.status === "rolled_back" || deployments.some((deployment) => deployment.status === "rolled_back");
      const failed = run.status === "failed" || failedGates.length > 0;
      const abstained = run.status === "abstained" || abstainedGates.length > 0;
      const passed = run.status === "succeeded" && !failed && !abstained && !rolledBack;
      const explanation = buildOutcomeExplanation({
        status: run.status,
        failureReason: run.failureReason,
        failedGates,
        abstainedGates,
        rolledBack,
        manifestHash: manifest?.hash,
      });
      return {
        schemaVersion: "factory-run-graph.v1",
        runId,
        status: run.status,
        attempts,
        manifestHash: manifest?.hash,
        outcome: {
          passed,
          abstained,
          rolledBack,
          failed,
          explanation,
        },
      };
    },

    async listAttempts(runId, request) {
      const attempts = (await input.readModel.listAttempts(runId)).map(toAttemptView);
      return paginate(attempts, request);
    },

    async listEvidence(runId, request) {
      const items = (await input.readModel.listEvidenceItems(runId)).map((item) => toEvidenceView(item, runId, signedUrlFor));
      return paginate(items, request);
    },

    async getEvidenceManifest(runId) {
      const manifest = await input.readModel.getEvidenceManifest(runId);
      if (!manifest) return null;
      return {
        schemaVersion: "evidence-manifest-view.v1",
        hash: manifest.hash,
        manifest: redactPayload(manifest.manifest, "secrets"),
      };
    },

    async getEvidenceItem(runId, itemId) {
      const item = (await input.readModel.listEvidenceItems(runId)).find((entry) => entry.id === itemId);
      return item ? toEvidenceView(item, runId, signedUrlFor) : null;
    },

    async listGates(runId, request) {
      const gates = (await input.readModel.listGateDecisions(runId)).map(toGateView);
      return paginate(gates, request);
    },

    async listScenarios(runId, request) {
      const scenarios = (await input.readModel.listScenarioRuns(runId)).map(toScenarioView);
      return paginate(scenarios, request);
    },

    async listProbes(runId, request) {
      const probes = (await input.readModel.listProbeRuns(runId)).map(toProbeView);
      return paginate(probes, request);
    },

    async listDeployments(runId) {
      const deployments = await input.readModel.listDeployments(runId);
      const observations = await input.readModel.listDeploymentObservations(runId);
      const items = deployments.map((deployment) => ({
        schemaVersion: "deployment-view.v1" as const,
        profile: deployment.profile,
        digest: deployment.digest,
        status: deployment.status,
        updatedAt: deployment.updatedAt,
        observations: observations
          .filter((observation) => observation.profile === deployment.profile)
          .map((observation) => ({
            observationId: observation.observationId,
            status: observation.status,
            observedAt: observation.observedAt,
          })),
      }));
      return { schemaVersion: "deployment-list.v1", items };
    },
  };
}

function toRunSummary(row: {
  runId: string;
  workflowId: string;
  taskId: string;
  status: string;
  currentNode?: string;
  failureReason?: string;
  updatedAt: string;
}): FactoryRunSummary {
  return {
    schemaVersion: "factory-run-summary.v1",
    runId: row.runId,
    workflowId: row.workflowId,
    taskId: row.taskId,
    status: row.status,
    currentNode: row.currentNode,
    failureReason: row.failureReason,
    updatedAt: row.updatedAt,
  };
}

function toAttemptView(row: {
  runId: string;
  attemptId: string;
  node: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  failureCode?: string;
  evidenceManifestHash?: string;
}): NodeAttemptView {
  return {
    schemaVersion: "factory-node-attempt.v1",
    runId: row.runId,
    attemptId: row.attemptId,
    node: row.node,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failureCode: row.failureCode,
    evidenceManifestHash: row.evidenceManifestHash,
  };
}

function toEvidenceView(
  row: {
    id: string;
    kind: string;
    mediaType: string;
    sha256: string;
    producerType: string;
    producerId: string;
    producerVersion: string;
    subject: Record<string, string>;
    redaction: "none" | "secrets" | "pii";
    createdAt: string;
  },
  runId: string,
  signedUrlFor: (runId: string, itemId: string) => string,
): EvidenceItemView {
  return {
    schemaVersion: "evidence-item-view.v1",
    id: row.id,
    kind: row.kind,
    mediaType: row.mediaType,
    sha256: row.sha256,
    producer: {
      type: row.producerType,
      id: row.producerId,
      version: row.producerVersion,
    },
    subject: row.subject,
    createdAt: row.createdAt,
    redaction: row.redaction,
    signedUrl: signedUrlFor(runId, row.id),
  };
}

function toGateView(row: {
  gateId: string;
  decision: string;
  policyVersion: string;
  reasons: unknown;
  evidenceRefs: string[];
  decidedAt: string;
}): GateDecisionView {
  return {
    schemaVersion: "gate-decision-view.v1",
    gateId: row.gateId,
    decision: row.decision,
    policyVersion: row.policyVersion,
    reasons: redactPayload(row.reasons, "secrets"),
    evidenceRefs: row.evidenceRefs,
    decidedAt: row.decidedAt,
  };
}

function toScenarioView(row: {
  scenarioId: string;
  attemptId: string;
  status: string;
  satisfaction?: number;
  startedAt: string;
  completedAt?: string;
}): ScenarioRunView {
  return {
    schemaVersion: "scenario-run-view.v1",
    scenarioId: row.scenarioId,
    attemptId: row.attemptId,
    status: row.status,
    satisfaction: row.satisfaction,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function toProbeView(row: {
  probeId: string;
  attemptId: string;
  status: string;
  record: unknown;
  recordedAt: string;
}): ProbeRunView {
  return {
    schemaVersion: "probe-run-view.v1",
    probeId: row.probeId,
    attemptId: row.attemptId,
    status: row.status,
    recordedAt: row.recordedAt,
    summary: redactPayload(row.record, "secrets"),
  };
}

function buildOutcomeExplanation(input: {
  status: string;
  failureReason?: string;
  failedGates: Array<{ gateId: string; decision: string }>;
  abstainedGates: Array<{ gateId: string; decision: string }>;
  rolledBack: boolean;
  manifestHash?: string;
}): string {
  if (input.rolledBack) {
    return `Release rolled back; manifest ${input.manifestHash ?? "unknown"} records deployment observation failure.`;
  }
  if (input.status === "abstained" || input.abstainedGates.length > 0) {
    const gates = input.abstainedGates.map((gate) => gate.gateId).join(", ");
    return `Run abstained${gates ? ` after gates: ${gates}` : ""}; budget or policy prevented completion.`;
  }
  if (input.status === "failed" || input.failedGates.length > 0) {
    const gates = input.failedGates.map((gate) => gate.gateId).join(", ");
    return `Run failed${input.failureReason ? `: ${input.failureReason}` : ""}${gates ? `; gates: ${gates}` : ""}.`;
  }
  if (input.status === "succeeded") {
    return `Run succeeded with manifest ${input.manifestHash ?? "pending"}.`;
  }
  return `Run is ${input.status}.`;
}
