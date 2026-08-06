import type { FactoryWorkflowInput } from "../temporal/client.js";

export const FACTORY_CORRELATION_KEYS = [
  "organization_id",
  "project_id",
  "repository_id",
  "task_id",
  "workflow_id",
  "run_id",
  "attempt_id",
  "node_id",
  "agent_session_id",
  "source_commit",
  "artifact_digest",
  "deployment_id",
  "scenario_id",
  "probe_id",
] as const;

export type FactoryCorrelationKey = (typeof FACTORY_CORRELATION_KEYS)[number];

export interface FactoryCorrelationContext {
  organizationId?: string;
  projectId?: string;
  repositoryId?: string;
  taskId: string;
  workflowId: string;
  runId: string;
  attemptId?: string;
  nodeId?: string;
  agentSessionId?: string;
  sourceCommit?: string;
  artifactDigest?: string;
  deploymentId?: string;
  scenarioId?: string;
  probeId?: string;
}

const SECRET_KEY_PATTERN = /(secret|token|password|authorization|api[_-]?key|credential|cookie|bearer)/i;
const BODY_KEY_PATTERN = /(transcript|source|body|prompt|output|stdout|stderr|content|message|file_content)/i;
const DEFAULT_MAX_BODY_BYTES = 512;

export function extractCorrelationFromRun(run: FactoryWorkflowInput): FactoryCorrelationContext {
  return {
    organizationId: run.organization,
    projectId: run.project,
    repositoryId: run.repository,
    taskId: run.taskId,
    workflowId: `factory-${run.runId}`,
    runId: run.runId,
    attemptId: run.attemptId,
  };
}

export function correlationAttributes(context: FactoryCorrelationContext): Record<string, string> {
  const entries: Array<[FactoryCorrelationKey, string | undefined]> = [
    ["organization_id", context.organizationId],
    ["project_id", context.projectId],
    ["repository_id", context.repositoryId],
    ["task_id", context.taskId],
    ["workflow_id", context.workflowId],
    ["run_id", context.runId],
    ["attempt_id", context.attemptId],
    ["node_id", context.nodeId],
    ["agent_session_id", context.agentSessionId],
    ["source_commit", context.sourceCommit],
    ["artifact_digest", context.artifactDigest],
    ["deployment_id", context.deploymentId],
    ["scenario_id", context.scenarioId],
    ["probe_id", context.probeId],
  ];

  const attributes: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") attributes[`factory.${key}`] = value;
  }
  return attributes;
}

export function redactValue(key: string, value: unknown): unknown {
  if (typeof value === "string" && SECRET_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (typeof value === "string" && BODY_KEY_PATTERN.test(key)) return summarizeBody(value);
  return value;
}

export function truncateBody(body: string, maxBytes: number = DEFAULT_MAX_BODY_BYTES): string {
  if (body.length <= maxBytes) return body;
  return summarizeBody(body);
}

function summarizeBody(body: string): string {
  return `[body omitted, ${body.length} bytes]`;
}

export function sanitizeAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    sanitized[key] = sanitizeValue(key, value);
  }
  return sanitized;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((entry, index) => sanitizeValue(`${key}.${index}`, entry));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(record)) {
      sanitized[childKey] = sanitizeValue(childKey, childValue);
    }
    return sanitized;
  }
  return redactValue(key, value);
}

export function correlationFromActivityInput(input: unknown): FactoryCorrelationContext | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const run = record.run;
  if (!run || typeof run !== "object") return undefined;
  const base = extractCorrelationFromRun(run as FactoryWorkflowInput);
  const nodeId = typeof record.role === "string" ? record.role : undefined;
  const artifactDigest = record.artifact && typeof record.artifact === "object"
    ? (record.artifact as { digest?: string }).digest
    : typeof record.digest === "string"
      ? record.digest
      : undefined;
  return {
    ...base,
    nodeId,
    artifactDigest,
    deploymentId: typeof record.deploymentId === "string" ? record.deploymentId : undefined,
    scenarioId: typeof record.scenarioId === "string" ? record.scenarioId : undefined,
    probeId: typeof record.probeId === "string" ? record.probeId : undefined,
  };
}
