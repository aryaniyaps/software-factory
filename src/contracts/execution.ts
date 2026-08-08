export type ExecutionStatus =
  | "running"
  | "input_required"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "rolled_back";

export interface ExecutionGraphNodeDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: "activity" | "agent" | "verification" | "release";
}

export interface ExecutionGraphEdgeDefinition {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly condition?: "succeeded" | "failed" | "retry";
}

const node = (
  id: string,
  kind: ExecutionGraphNodeDefinition["kind"],
): ExecutionGraphNodeDefinition => ({ id, label: id.replaceAll("_", " "), kind });

export const FACTORY_EXECUTION_GRAPH_V2 = {
  version: "factory-graph.v2" as const,
  nodes: [
    node("prepare_repository", "activity"),
    node("create_worktree", "activity"),
    node("security_scan", "verification"),
    node("discovery_plan", "agent"),
    node("implement", "agent"),
    node("deterministic_checks", "verification"),
    node("repair", "agent"),
    node("maintainability_assess", "verification"),
    node("behavioral_verify", "verification"),
    node("review", "agent"),
    node("build_artifact", "release"),
    node("release_controller", "release"),
  ],
  edges: [
    edge("prepare_repository", "create_worktree"),
    edge("create_worktree", "security_scan"),
    edge("security_scan", "discovery_plan"),
    edge("discovery_plan", "implement"),
    edge("implement", "deterministic_checks"),
    edge("deterministic_checks", "maintainability_assess", "succeeded"),
    edge("deterministic_checks", "repair", "failed"),
    edge("repair", "deterministic_checks", "retry"),
    edge("maintainability_assess", "behavioral_verify", "succeeded"),
    edge("maintainability_assess", "repair", "failed"),
    edge("repair", "maintainability_assess", "retry"),
    edge("behavioral_verify", "review"),
    edge("review", "build_artifact"),
    edge("build_artifact", "release_controller"),
  ],
} as const;

function edge(
  source: string,
  target: string,
  condition?: ExecutionGraphEdgeDefinition["condition"],
): ExecutionGraphEdgeDefinition {
  return { id: `${source}:${target}`, source, target, ...(condition ? { condition } : {}) };
}

export interface ExecutionObjectRef {
  readonly objectId: string;
  readonly sha256: string;
  readonly uri: string;
  readonly redaction: "none" | "secrets" | "pii";
  readonly mediaType?: string;
}

export interface NodeAttemptRecord {
  readonly schemaVersion: "node-attempt.v2";
  readonly recordId: string;
  readonly nodeId: string;
  readonly attemptId: string;
  readonly status: "running" | "succeeded" | "failed" | "cancelled";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly evidenceRefs: readonly string[];
}

export interface ToolCallRecord {
  readonly schemaVersion: "tool-call.v2";
  readonly recordId: string;
  readonly attemptId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly status: "running" | "succeeded" | "failed" | "interrupted";
  readonly input: ExecutionObjectRef;
  readonly output?: ExecutionObjectRef;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export interface AgentTurnRecord {
  readonly schemaVersion: "agent-turn.v2";
  readonly recordId: string;
  readonly attemptId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly turnIndex: number;
  readonly role: string;
  readonly transcript: ExecutionObjectRef;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface ExecutionEventRecord {
  readonly schemaVersion: "execution-event.v2";
  readonly recordId: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: unknown;
}

export type ExecutionRecord = NodeAttemptRecord | AgentTurnRecord | ToolCallRecord | ExecutionEventRecord;

export interface ExecutionLedger {
  readonly schemaVersion: "factory-execution-ledger.v2";
  readonly workflowId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly repository: string;
  readonly prompt: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly status: ExecutionStatus;
  readonly currentNode?: string;
  readonly failedNode?: string;
  readonly stateRevision: number;
  readonly records: readonly ExecutionRecord[];
}

export interface CreateExecutionLedgerInput {
  readonly workflowId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly repository: string;
  readonly prompt: string;
  readonly startedAt: string;
}

export function createExecutionLedger(input: CreateExecutionLedgerInput): ExecutionLedger {
  return {
    schemaVersion: "factory-execution-ledger.v2",
    ...input,
    updatedAt: input.startedAt,
    status: "running",
    stateRevision: 0,
    records: [],
  };
}

export function appendExecutionRecord(
  ledger: ExecutionLedger,
  record: ExecutionRecord,
): ExecutionLedger {
  const index = ledger.records.findIndex((entry) => entry.recordId === record.recordId);
  if (index >= 0 && JSON.stringify(ledger.records[index]) === JSON.stringify(record)) return ledger;
  const records = [...ledger.records];
  if (index >= 0) records[index] = record;
  else records.push(record);
  return {
    ...ledger,
    records,
    stateRevision: ledger.stateRevision + 1,
    updatedAt: recordTime(record),
  };
}

export function updateExecutionState(
  ledger: ExecutionLedger,
  input: {
    status?: ExecutionStatus;
    currentNode?: string | null;
    failedNode?: string | null;
    updatedAt: string;
  },
): ExecutionLedger {
  const next = {
    ...ledger,
    status: input.status ?? ledger.status,
    currentNode: input.currentNode === null ? undefined : (input.currentNode ?? ledger.currentNode),
    failedNode: input.failedNode === null ? undefined : (input.failedNode ?? ledger.failedNode),
    updatedAt: input.updatedAt,
    stateRevision: ledger.stateRevision + 1,
  };
  return next;
}

export interface FactoryExecutionViewV2 {
  readonly schemaVersion: "factory-execution-view.v2";
  readonly workflowId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly repository: string;
  readonly prompt: string;
  readonly status: ExecutionStatus;
  readonly currentNode?: string;
  readonly failedNode?: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly stateRevision: number;
  readonly graph: {
    readonly version: "factory-graph.v2";
    readonly nodes: readonly (ExecutionGraphNodeDefinition & {
      readonly status: "idle" | "running" | "succeeded" | "failed" | "cancelled";
      readonly attemptCount: number;
    })[];
    readonly edges: readonly ExecutionGraphEdgeDefinition[];
  };
  readonly attempts: readonly NodeAttemptRecord[];
  readonly turns: readonly AgentTurnRecord[];
  readonly toolCalls: readonly ToolCallRecord[];
  readonly timeline: readonly ExecutionEventRecord[];
  readonly outcome: {
    readonly passed: boolean;
    readonly failed: boolean;
    readonly rolledBack: boolean;
    readonly explanation: string;
  };
}

export function executionView(ledger: ExecutionLedger): FactoryExecutionViewV2 {
  const attempts = ledger.records.filter((record): record is NodeAttemptRecord => record.schemaVersion === "node-attempt.v2");
  const turns = ledger.records.filter((record): record is AgentTurnRecord => record.schemaVersion === "agent-turn.v2");
  const toolCalls = ledger.records.filter((record): record is ToolCallRecord => record.schemaVersion === "tool-call.v2");
  const timeline = ledger.records.filter((record): record is ExecutionEventRecord => record.schemaVersion === "execution-event.v2");
  return {
    schemaVersion: "factory-execution-view.v2",
    workflowId: ledger.workflowId,
    runId: ledger.runId,
    taskId: ledger.taskId,
    repository: ledger.repository,
    prompt: ledger.prompt,
    status: ledger.status,
    currentNode: ledger.currentNode,
    failedNode: ledger.failedNode,
    startedAt: ledger.startedAt,
    updatedAt: ledger.updatedAt,
    stateRevision: ledger.stateRevision,
    graph: {
      version: FACTORY_EXECUTION_GRAPH_V2.version,
      nodes: FACTORY_EXECUTION_GRAPH_V2.nodes.map((definition) => {
        const nodeAttempts = attempts.filter((attempt) => attempt.nodeId === definition.id);
        const latest = nodeAttempts.at(-1);
        const status = ledger.currentNode === definition.id && ledger.status === "running"
          ? "running"
          : latest?.status ?? "idle";
        return { ...definition, status, attemptCount: nodeAttempts.length };
      }),
      edges: FACTORY_EXECUTION_GRAPH_V2.edges,
    },
    attempts,
    turns,
    toolCalls,
    timeline,
    outcome: outcomeFor(ledger),
  };
}

function recordTime(record: ExecutionRecord): string {
  if (record.schemaVersion === "execution-event.v2") return record.occurredAt;
  return record.completedAt ?? record.startedAt;
}

function outcomeFor(ledger: ExecutionLedger): FactoryExecutionViewV2["outcome"] {
  if (ledger.status === "succeeded") {
    return { passed: true, failed: false, rolledBack: false, explanation: "Execution succeeded." };
  }
  if (ledger.status === "rolled_back") {
    return { passed: false, failed: false, rolledBack: true, explanation: "Release was rolled back." };
  }
  if (ledger.status === "failed") {
    return {
      passed: false,
      failed: true,
      rolledBack: false,
      explanation: ledger.failedNode ? `Execution failed at ${ledger.failedNode}.` : "Execution failed.",
    };
  }
  return { passed: false, failed: false, rolledBack: false, explanation: `Execution is ${ledger.status}.` };
}
