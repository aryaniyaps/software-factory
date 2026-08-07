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
  prompt: string;
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
