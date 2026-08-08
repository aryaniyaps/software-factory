/** Mirrors src/contracts/nodes.ts — keep in sync with factory pipeline topology. */
export const FACTORY_NODE_NAMES = [
  "prepare_repository",
  "create_worktree",
  "security_scan",
  "discovery_plan",
  "implement",
  "deterministic_checks",
  "repair",
  "maintainability_assess",
  "behavioral_verify",
  "review",
  "build_artifact",
  "release_controller",
] as const;

export type FactoryNodeName = (typeof FACTORY_NODE_NAMES)[number];

export interface ErrorResponse {
  schemaVersion: "error.v1";
  error: string;
}

export interface FactoryRunSummary {
  schemaVersion: "factory-run-summary.v1";
  runId: string;
  workflowId: string;
  taskId: string;
  status: string;
  currentNode?: string;
  failureReason?: string;
  updatedAt: string;
}

export interface PageResult<T> {
  schemaVersion: "page.v1";
  items: readonly T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface NodeAttempt {
  schemaVersion: "factory-node-attempt.v1";
  runId: string;
  attemptId: string;
  node: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  failureCode?: string;
  evidenceManifestHash?: string;
}

export interface RunGraph {
  schemaVersion: "factory-run-graph.v1";
  runId: string;
  status: string;
  attempts: NodeAttempt[];
  manifestHash?: string;
  outcome: {
    passed: boolean;
    rolledBack: boolean;
    failed: boolean;
    explanation: string;
  };
}

export interface OperationResponse {
  schemaVersion: "operation.v1";
  operation: string;
  runId: string;
  status: "signaled";
}

export interface RunEvent {
  event_id: string;
  type: string;
  payload: unknown;
  created_at: string;
}

export interface CreateTaskInput {
  repository: string;
  prompt: string;
}

export interface GitHubStatus {
  schemaVersion: "github-status.v1";
  configured: boolean;
  connected: boolean;
  installations: Array<{
    installationId: number;
    accountLogin: string;
    accountType: string;
    suspended: boolean;
  }>;
}

export interface GitHubRepository {
  fullName: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface GitHubRepositoriesResponse {
  schemaVersion: "github-repos.v1";
  items: GitHubRepository[];
  hasMore: boolean;
}

export interface CreateTaskResponse {
  id: string;
}

export interface ClarificationRequest {
  schemaVersion: "clarification-request.v1";
  requestId: string;
  runId: string;
  threadId: string;
  requestingNode: string;
  recipient: { type: string; id: string };
  question: string;
  stateRevision: number;
  contextRefs: string[];
  createdAt: string;
  deadlineAt: string;
}

export type NodeAttemptStatus = "idle" | "running" | "succeeded" | "failed" | "cancelled";

export interface NodeVisualState {
  status: NodeAttemptStatus;
  attemptCount: number;
  isCurrent: boolean;
}

export interface EvidenceItemView {
  schemaVersion: "evidence-item-view.v1";
  id: string;
  kind: string;
  mediaType: string;
  sha256: string;
  producer: { type: string; id: string; version: string };
  subject: Record<string, string>;
  createdAt: string;
  redaction: "none" | "secrets" | "pii";
  signedUrl?: string;
}

export interface EvidenceContentView {
  schemaVersion: "evidence-content.v1";
  itemId: string;
  sha256: string;
  mediaType: string;
  redaction: "none" | "secrets" | "pii";
  note?: string;
}

export interface GateDecisionView {
  schemaVersion: "gate-decision-view.v1";
  gateId: string;
  decision: string;
  policyVersion: string;
  reasons: unknown;
  evidenceRefs: string[];
  decidedAt: string;
}

export interface ScenarioRunView {
  schemaVersion: "scenario-run-view.v1";
  scenarioId: string;
  attemptId: string;
  status: string;
  satisfaction?: number;
  startedAt: string;
  completedAt?: string;
}

export interface ProbeRunView {
  schemaVersion: "probe-run-view.v1";
  probeId: string;
  attemptId: string;
  status: string;
  recordedAt: string;
  summary: unknown;
}

export interface DeploymentView {
  schemaVersion: "deployment-view.v1";
  profile: string;
  digest: string;
  status: string;
  updatedAt: string;
  observations: Array<{
    observationId: string;
    status: string;
    observedAt: string;
  }>;
}

export interface DeploymentList {
  schemaVersion: "deployment-list.v1";
  items: DeploymentView[];
}
