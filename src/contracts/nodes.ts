import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { parseCriticReport } from "../assurance/maintainability/findings.js";
import { FailureEnvelopeSchema, type FailureEnvelope } from "./failures.js";

export const FACTORY_NODE_NAMES = [
  "prepare_repository", "create_worktree", "security_scan", "scout", "plan", "implement",
  "deterministic_checks", "repair", "maintainability_assess", "behavioral_verify", "review", "build_artifact", "release_controller",
] as const;
export const FactoryNodeNameSchema = Type.Union(FACTORY_NODE_NAMES.map((name) => Type.Literal(name)) as TSchema[]);
export type FactoryNodeName = (typeof FACTORY_NODE_NAMES)[number];

export const AgentRoles = ["scout", "plan", "implement", "repair", "review", "maintainability_critic"] as const;
export const AgentRoleSchema = Type.Union(AgentRoles.map((role) => Type.Literal(role)) as TSchema[]);
export type AgentRole = (typeof AgentRoles)[number];

const JsonValueSchema = Type.Any();
const JsonObjectSchema = Type.Record(Type.String({ minLength: 1 }), JsonValueSchema);
export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject { readonly [key: string]: JsonValue; }
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

const AgentOutputBase = {
  schemaVersion: Type.Literal("agent-output.v1"),
  status: Type.Union([Type.Literal("succeeded"), Type.Literal("failed"), Type.Literal("abstained")]),
  summary: Type.String({ minLength: 1 }),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  data: JsonObjectSchema,
} as const;

export const AgentOutputSchema = Type.Union(AgentRoles.map((role) => Type.Object({ role: Type.Literal(role), ...AgentOutputBase }, { additionalProperties: false })) as TSchema[]);

export interface AgentOutputBase {
  readonly schemaVersion: "agent-output.v1";
  readonly status: "succeeded" | "failed" | "abstained";
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
    Type.Literal("abstained"), Type.Literal("failed"), Type.Literal("cancelled"),
  ]),
  completedNodes: Type.Array(FactoryNodeNameSchema),
  nodeAttempts: Type.Array(NodeAttemptRefSchema),
  currentNode: Type.Optional(FactoryNodeNameSchema),
  failedNode: Type.Optional(FactoryNodeNameSchema),
  budget: Type.Optional(WorkflowBudgetStateSchema),
  continuationGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
}, { additionalProperties: false });
export interface FactoryRunState {
  readonly schemaVersion: "factory-run.v1";
  readonly runId: string;
  readonly status: "running" | "succeeded" | "rolled_back" | "abstained" | "failed" | "cancelled";
  readonly completedNodes: readonly FactoryNodeName[];
  readonly nodeAttempts: readonly NodeAttemptRef[];
  readonly currentNode?: FactoryNodeName;
  readonly failedNode?: FactoryNodeName;
  readonly budget?: WorkflowBudgetState;
  readonly continuationGeneration?: number;
}

function parse<T>(schema: TSchema, value: unknown): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid node contract: ${error?.message || "schema mismatch"}`);
}

function validateMaintainabilityCriticData(data: JsonObject): void {
  if (!("report" in data)) {
    throw new Error("Invalid maintainability critic output: report required in data");
  }
  parseCriticReport(data.report);
}

export function parseAgentOutput(value: unknown): AgentOutput {
  const candidate = typeof value === "string" ? JSON.parse(value) : value;
  const output = parse<AgentOutput>(AgentOutputSchema, candidate);
  if (output.role === "maintainability_critic") {
    validateMaintainabilityCriticData(output.data);
  }
  return output;
}

export function parseNodeResult<T>(value: unknown): NodeResult<T> {
  return parse<NodeResult<T>>(NodeResultSchema, value);
}

export function parseFactoryRunState(value: unknown): FactoryRunState {
  return parse<FactoryRunState>(FactoryRunStateSchema, value);
}
