import { Type, type Static } from "typebox";

export const ErrorResponseSchema = Type.Object({
  schemaVersion: Type.Literal("error.v1"),
  error: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const FactoryRunSummarySchema = Type.Object({
  schemaVersion: Type.Literal("factory-run-summary.v1"),
  runId: Type.String({ minLength: 1 }),
  workflowId: Type.String({ minLength: 1 }),
  taskId: Type.String({ minLength: 1 }),
  status: Type.String({ minLength: 1 }),
  currentNode: Type.Optional(Type.String()),
  failureReason: Type.Optional(Type.String()),
  updatedAt: Type.String({ format: "date-time" }),
}, { additionalProperties: false });

export const NodeAttemptSchema = Type.Object({
  schemaVersion: Type.Literal("factory-node-attempt.v1"),
  runId: Type.String({ minLength: 1 }),
  attemptId: Type.String({ minLength: 1 }),
  node: Type.String({ minLength: 1 }),
  status: Type.String({ minLength: 1 }),
  startedAt: Type.String({ format: "date-time" }),
  completedAt: Type.Optional(Type.String({ format: "date-time" })),
  failureCode: Type.Optional(Type.String()),
  evidenceManifestHash: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const EvidenceItemViewSchema = Type.Object({
  schemaVersion: Type.Literal("evidence-item-view.v1"),
  id: Type.String({ minLength: 1 }),
  kind: Type.String({ minLength: 1 }),
  mediaType: Type.String({ minLength: 1 }),
  sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  producer: Type.Object({
    type: Type.String(),
    id: Type.String(),
    version: Type.String(),
  }),
  subject: Type.Record(Type.String(), Type.String()),
  createdAt: Type.String({ format: "date-time" }),
  redaction: Type.Union([Type.Literal("none"), Type.Literal("secrets"), Type.Literal("pii")]),
  signedUrl: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const GateDecisionViewSchema = Type.Object({
  schemaVersion: Type.Literal("gate-decision-view.v1"),
  gateId: Type.String({ minLength: 1 }),
  decision: Type.String({ minLength: 1 }),
  policyVersion: Type.String({ minLength: 1 }),
  reasons: Type.Unknown(),
  evidenceRefs: Type.Array(Type.String()),
  decidedAt: Type.String({ format: "date-time" }),
}, { additionalProperties: false });

export const ScenarioRunViewSchema = Type.Object({
  schemaVersion: Type.Literal("scenario-run-view.v1"),
  scenarioId: Type.String({ minLength: 1 }),
  attemptId: Type.String({ minLength: 1 }),
  status: Type.String({ minLength: 1 }),
  satisfaction: Type.Optional(Type.Number()),
  startedAt: Type.String({ format: "date-time" }),
  completedAt: Type.Optional(Type.String({ format: "date-time" })),
}, { additionalProperties: false });

export const ProbeRunViewSchema = Type.Object({
  schemaVersion: Type.Literal("probe-run-view.v1"),
  probeId: Type.String({ minLength: 1 }),
  attemptId: Type.String({ minLength: 1 }),
  status: Type.String({ minLength: 1 }),
  recordedAt: Type.String({ format: "date-time" }),
  summary: Type.Unknown(),
}, { additionalProperties: false });

export const DeploymentViewSchema = Type.Object({
  schemaVersion: Type.Literal("deployment-view.v1"),
  profile: Type.String({ minLength: 1 }),
  digest: Type.String({ minLength: 1 }),
  status: Type.String({ minLength: 1 }),
  updatedAt: Type.String({ format: "date-time" }),
  observations: Type.Array(Type.Object({
    observationId: Type.String(),
    status: Type.String(),
    observedAt: Type.String({ format: "date-time" }),
  })),
}, { additionalProperties: false });

export const RunGraphSchema = Type.Object({
  schemaVersion: Type.Literal("factory-run-graph.v1"),
  runId: Type.String({ minLength: 1 }),
  status: Type.String({ minLength: 1 }),
  attempts: Type.Array(NodeAttemptSchema),
  manifestHash: Type.Optional(Type.String()),
  outcome: Type.Object({
    passed: Type.Boolean(),
    abstained: Type.Boolean(),
    rolledBack: Type.Boolean(),
    failed: Type.Boolean(),
    explanation: Type.String(),
  }),
}, { additionalProperties: false });

export const OperationResponseSchema = Type.Object({
  schemaVersion: Type.Literal("operation.v1"),
  operation: Type.String({ minLength: 1 }),
  runId: Type.String({ minLength: 1 }),
  status: Type.Literal("signaled"),
}, { additionalProperties: false });

export type FactoryRunSummary = Static<typeof FactoryRunSummarySchema>;
export type NodeAttemptView = Static<typeof NodeAttemptSchema>;
export type EvidenceItemView = Static<typeof EvidenceItemViewSchema>;
export type GateDecisionView = Static<typeof GateDecisionViewSchema>;
export type ScenarioRunView = Static<typeof ScenarioRunViewSchema>;
export type ProbeRunView = Static<typeof ProbeRunViewSchema>;
export type DeploymentView = Static<typeof DeploymentViewSchema>;
export type RunGraph = Static<typeof RunGraphSchema>;
export type OperationResponse = Static<typeof OperationResponseSchema>;
