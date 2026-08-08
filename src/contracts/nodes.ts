import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { parseCriticReport } from "../assurance/maintainability/findings.js";
import { FailureEnvelopeSchema, type FailureEnvelope } from "./failures.js";
import { ClarificationRequestSchema, type ClarificationRequest } from "./clarification.js";

export const FACTORY_NODE_NAMES = [
  "prepare_repository", "create_worktree", "security_scan", "scout", "plan", "implement",
  "deterministic_checks", "repair", "maintainability_assess", "behavioral_verify", "review", "build_artifact", "release_controller",
] as const;
export const FACTORY_NODE_NAMES_V2 = [
  "prepare_repository", "create_worktree", "security_scan", "discovery_plan", "implement",
  "deterministic_checks", "repair", "maintainability_assess", "behavioral_verify", "review", "build_artifact", "release_controller",
] as const;
const AllFactoryNodeNames = [...new Set([...FACTORY_NODE_NAMES, ...FACTORY_NODE_NAMES_V2])] as const;
export const FactoryNodeNameSchema = Type.Union(AllFactoryNodeNames.map((name) => Type.Literal(name)) as TSchema[]);
export type FactoryNodeName = (typeof AllFactoryNodeNames)[number];
export const FactoryNodeNameV2Schema = Type.Union(FACTORY_NODE_NAMES_V2.map((name) => Type.Literal(name)) as TSchema[]);
export type FactoryNodeNameV2 = (typeof FACTORY_NODE_NAMES_V2)[number];

export const AgentRoles = ["scout", "plan", "discovery_plan", "implement", "repair", "review", "maintainability_critic"] as const;
export const AgentRoleSchema = Type.Union(AgentRoles.map((role) => Type.Literal(role)) as TSchema[]);
export type AgentRole = (typeof AgentRoles)[number];

const JsonValueSchema = Type.Any();
const JsonObjectSchema = Type.Record(Type.String({ minLength: 1 }), JsonValueSchema);
export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject { readonly [key: string]: JsonValue; }
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

const AgentOutputBase = {
  schemaVersion: Type.Literal("agent-output.v1"),
  status: Type.Union([
    Type.Literal("succeeded"),
    Type.Literal("failed"),
    Type.Literal("escalate_to_human"),
    Type.Literal("abstained"),
  ]),
  summary: Type.String({ minLength: 1 }),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  data: JsonObjectSchema,
} as const;

export const AgentOutputSchema = Type.Union(AgentRoles.map((role) => Type.Object({ role: Type.Literal(role), ...AgentOutputBase }, { additionalProperties: false })) as TSchema[]);

export interface AgentOutputBase {
  readonly schemaVersion: "agent-output.v1";
  readonly status: "succeeded" | "failed" | "escalate_to_human" | "abstained";
  readonly summary: string;
  readonly evidenceRefs: readonly string[];
  readonly data: JsonObject;
}

export type AgentOutput = AgentOutputBase & { readonly role: AgentRole };

export const AgentInputSchema = JsonObjectSchema;
export type AgentInput = object;

export const NodeResultSchema = Type.Object({
  schemaVersion: Type.Literal("node-result.v1"),
  node: FactoryNodeNameSchema,
  attemptId: Type.String({ minLength: 1 }),
  status: Type.Union([Type.Literal("succeeded"), Type.Literal("failed"), Type.Literal("cancelled")]),
  output: Type.Optional(Type.Any()),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  startedAt: Type.String({ format: "date-time" }),
  completedAt: Type.String({ format: "date-time" }),
  failure: Type.Optional(FailureEnvelopeSchema),
}, { additionalProperties: false });
export interface NodeResult<T> {
  readonly schemaVersion: "node-result.v1";
  readonly node: FactoryNodeName;
  readonly attemptId: string;
  readonly status: "succeeded" | "failed" | "cancelled";
  readonly output?: T;
  readonly evidenceRefs: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly failure?: FailureEnvelope;
}

export const NodeAttemptRefSchema = Type.Object({
  node: FactoryNodeNameSchema,
  attemptId: Type.String({ minLength: 1 }),
  status: Type.Union([Type.Literal("succeeded"), Type.Literal("failed"), Type.Literal("cancelled")]),
}, { additionalProperties: false });
export interface NodeAttemptRef {
  readonly node: FactoryNodeName;
  readonly attemptId: string;
  readonly status: "succeeded" | "failed" | "cancelled";
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly evidenceRefs?: readonly string[];
}

export const WorkflowBudgetStateSchema = Type.Object({
  maxAgentAttempts: Type.Integer({ minimum: 1 }),
  maxRepairAttempts: Type.Integer({ minimum: 0 }),
  wallClockBudgetMs: Type.Integer({ minimum: 1 }),
  tokenBudget: Type.Integer({ minimum: 1 }),
  agentAttemptsUsed: Type.Integer({ minimum: 0 }),
  repairAttemptsUsed: Type.Integer({ minimum: 0 }),
  wallClockUsedMs: Type.Integer({ minimum: 0 }),
  tokensUsed: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });
export interface WorkflowBudgetState {
  readonly maxAgentAttempts: number;
  readonly maxRepairAttempts: number;
  readonly wallClockBudgetMs: number;
  readonly tokenBudget: number;
  readonly agentAttemptsUsed: number;
  readonly repairAttemptsUsed: number;
  readonly wallClockUsedMs: number;
  readonly tokensUsed: number;
}

export const FactoryRunStateSchema = Type.Object({
  schemaVersion: Type.Literal("factory-run.v1"),
  runId: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("running"), Type.Literal("succeeded"), Type.Literal("rolled_back"),
    Type.Literal("failed"), Type.Literal("cancelled"), Type.Literal("input_required"),
  ]),
  completedNodes: Type.Array(FactoryNodeNameSchema),
  nodeAttempts: Type.Array(NodeAttemptRefSchema),
  currentNode: Type.Optional(FactoryNodeNameSchema),
  failedNode: Type.Optional(FactoryNodeNameSchema),
  pendingClarification: Type.Optional(ClarificationRequestSchema),
  budget: Type.Optional(WorkflowBudgetStateSchema),
  continuationGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
}, { additionalProperties: false });
export interface FactoryRunState {
  readonly schemaVersion: "factory-run.v1";
  readonly runId: string;
  readonly status: "running" | "succeeded" | "rolled_back" | "failed" | "cancelled" | "input_required";
  readonly completedNodes: readonly FactoryNodeName[];
  readonly nodeAttempts: readonly NodeAttemptRef[];
  readonly currentNode?: FactoryNodeName;
  readonly failedNode?: FactoryNodeName;
  readonly pendingClarification?: ClarificationRequest;
  readonly budget?: WorkflowBudgetState;
  readonly continuationGeneration?: number;
}

function parse<T>(schema: TSchema, value: unknown): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid node contract: ${error?.message || "schema mismatch"}`);
}

/** Pull a JSON value out of raw model text (plain JSON, fences, or surrounding prose). */
export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Invalid node contract: empty agent output");

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // continue
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // continue
    }
  }

  throw new Error("Invalid node contract: agent output is not valid JSON");
}

function validateMaintainabilityCriticData(data: JsonObject): void {
  if (!("report" in data)) {
    throw new Error("Invalid maintainability critic output: report required in data");
  }
  parseCriticReport(data.report);
}

export function parseAgentOutput(value: unknown): AgentOutput {
  const candidate = typeof value === "string" ? extractJsonValue(value) : value;
  const normalized = normalizeAgentOutputCandidate(candidate);
  const output = parse<AgentOutput>(AgentOutputSchema, normalized);
  if (output.role === "maintainability_critic") {
    validateMaintainabilityCriticData(output.data);
  }
  return normalizeEscalation(output);
}

/** Soften common model deviations before strict schema validation. */
function normalizeAgentOutputCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };

  if (typeof record.role === "string") {
    record.role = record.role.trim().toLowerCase();
  }
  if (typeof record.schemaVersion !== "string" || !record.schemaVersion) {
    record.schemaVersion = "agent-output.v1";
  }
  if (typeof record.summary !== "string" || !record.summary.trim()) {
    record.summary = "Agent completed without a summary.";
  }
  if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
    record.data = {};
  }

  const refs = Array.isArray(record.evidenceRefs)
    ? record.evidenceRefs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)
    : [];
  if (refs.length === 0) {
    // Only a truthful abstention may use the explicit no-evidence sentinel.
    // Successful and failed work must supply a real evidence reference.
    record.evidenceRefs = record.status === "abstained" ? ["evidence://abstained"] : refs;
  } else {
    record.evidenceRefs = refs;
  }

  return record;
}

function normalizeEscalation(output: AgentOutput): AgentOutput {
  if (output.status !== "escalate_to_human") return output;
  const question = typeof output.data.question === "string" && output.data.question.trim()
    ? output.data.question.trim()
    : output.summary;
  const urgency = output.data.urgency === "low" || output.data.urgency === "medium" || output.data.urgency === "high"
    ? output.data.urgency
    : undefined;
  const data: JsonObject = {
    ...Object.fromEntries(Object.entries(output.data).filter(([key]) => key !== "urgency")),
    question,
    ...(urgency ? { urgency } : {}),
  };
  validateEscalationData(data);
  return { ...output, data };
}

function validateEscalationData(data: JsonObject): void {
  if (!("question" in data) || typeof data.question !== "string" || !data.question.trim()) {
    throw new Error("Invalid escalation output: question required in data");
  }
  if ("urgency" in data && data.urgency !== "low" && data.urgency !== "medium" && data.urgency !== "high") {
    throw new Error("Invalid escalation output: urgency must be low, medium, or high");
  }
}

export function parseNodeResult<T>(value: unknown): NodeResult<T> {
  return parse<NodeResult<T>>(NodeResultSchema, value);
}

export function parseFactoryRunState(value: unknown): FactoryRunState {
  return parse<FactoryRunState>(FactoryRunStateSchema, value);
}
