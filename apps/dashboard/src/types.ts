export interface ExecutionGraphNode {
  id: string;
  label: string;
  kind: "activity" | "agent" | "verification" | "release";
  status: "idle" | "running" | "succeeded" | "failed" | "cancelled";
  attemptCount: number;
}

export type NodeAttemptStatus = ExecutionGraphNode["status"];

export interface ExecutionGraphEdge {
  id: string;
  source: string;
  target: string;
  condition?: "succeeded" | "failed" | "retry";
}

export interface ExecutionEvent {
  schemaVersion: "execution-event.v2";
  recordId: string;
  type: string;
  occurredAt: string;
  payload: unknown;
}

export interface FactoryExecutionView {
  schemaVersion: "factory-execution-view.v2";
  workflowId: string;
  runId: string;
  taskId: string;
  repository: string;
  prompt: string;
  status: string;
  currentNode?: string;
  failedNode?: string;
  startedAt: string;
  updatedAt: string;
  stateRevision: number;
  graph: {
    version: "factory-graph.v2";
    nodes: ExecutionGraphNode[];
    edges: ExecutionGraphEdge[];
  };
  attempts: Array<{
    schemaVersion: "node-attempt.v2";
    recordId: string;
    nodeId: string;
    attemptId: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    failureCode?: string;
    evidenceRefs: string[];
  }>;
  turns: unknown[];
  toolCalls: unknown[];
  timeline: ExecutionEvent[];
  outcome: {
    passed: boolean;
    rolledBack: boolean;
    failed: boolean;
    explanation: string;
  };
}

export interface CreateExecutionInput {
  repository: string;
  prompt: string;
}

export interface CreateExecutionResponse {
  workflowId: string;
  runId: string;
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
