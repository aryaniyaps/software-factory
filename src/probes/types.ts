import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";

export const ProbeAdapterSchema = Type.Object({
  command: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Array(Type.String())),
}, { additionalProperties: false });

export const ProbeDefinitionSchema = Type.Object({
  schemaVersion: Type.Literal("probe.v1"),
  id: Type.String({ pattern: "^PRB-[A-Z0-9][A-Z0-9-]*$" }),
  title: Type.String({ minLength: 1 }),
  requirement: Type.String({ minLength: 1 }),
  difficulty: Type.Integer({ minimum: 1, maximum: 10 }),
  acceptance: Type.Array(Type.String({ pattern: "^AC-[A-Z0-9][A-Z0-9-]*$" }), { minItems: 1 }),
  adapter: ProbeAdapterSchema,
  repeats: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  maxVariance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  startingMarkers: Type.Object({
    baseline: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    candidate: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export type ProbeDefinition = Static<typeof ProbeDefinitionSchema>;

export const ProbeAttemptMetricsSchema = Type.Object({
  schemaVersion: Type.Literal("probe-attempt.v1"),
  probeId: Type.String({ minLength: 1 }),
  attemptId: Type.String({ minLength: 1 }),
  revision: Type.Union([Type.Literal("baseline"), Type.Literal("candidate")]),
  repeatIndex: Type.Integer({ minimum: 0 }),
  success: Type.Boolean(),
  wallTimeMs: Type.Number({ minimum: 0 }),
  tokens: Type.Integer({ minimum: 0 }),
  agentAttempts: Type.Integer({ minimum: 0 }),
  filesTouched: Type.Integer({ minimum: 0 }),
  modulesTouched: Type.Integer({ minimum: 0 }),
  symbolsTouched: Type.Integer({ minimum: 0 }),
  dispersion: Type.Number({ minimum: 0 }),
  publicApiGrowth: Type.Integer({ minimum: 0 }),
  regressions: Type.Integer({ minimum: 0 }),
  contextBytes: Type.Integer({ minimum: 0 }),
  adapterOutput: Type.Object({
    exitCode: Type.Integer(),
    stdout: Type.String(),
    stderr: Type.String(),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export type ProbeAttemptMetrics = Static<typeof ProbeAttemptMetricsSchema>;

export const ProbeValidationStatusSchema = Type.Union([
  Type.Literal("valid"),
  Type.Literal("invalid"),
  Type.Literal("leaked"),
  Type.Literal("noisy"),
  Type.Literal("already_implemented"),
  Type.Literal("unequal_difficulty"),
]);

export type ProbeValidationStatus = Static<typeof ProbeValidationStatusSchema>;

export const ProbeRunStatusSchema = Type.Union([
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("invalid"),
  Type.Literal("noisy"),
  Type.Literal("excluded"),
]);

export type ProbeRunStatus = Static<typeof ProbeRunStatusSchema>;

export interface ProbeValidationResult {
  readonly status: ProbeValidationStatus;
  readonly mergeable: false;
  readonly reason?: string;
}

export interface ProbeComparisonResult {
  readonly regressionDetected: boolean;
  readonly effectSize: number;
  readonly confidence: number;
  readonly baselineSuccessRate: number;
  readonly candidateSuccessRate: number;
  readonly baselineMeanWallTimeMs: number;
  readonly candidateMeanWallTimeMs: number;
  readonly baselineDispersion: number;
  readonly candidateDispersion: number;
  readonly evidenceRefs: readonly string[];
}

export interface ProbeRunRecord {
  readonly probeId: string;
  readonly attemptId: string;
  readonly status: ProbeRunStatus;
  readonly mergeable: false;
  readonly baselineRepeats: readonly ProbeAttemptMetrics[];
  readonly candidateRepeats: readonly ProbeAttemptMetrics[];
  readonly comparison?: ProbeComparisonResult;
  readonly exclusionReason?: string;
  readonly acceptanceEvidence: Readonly<Record<string, readonly string[]>>;
}

export const ProbeSuiteResultSchema = Type.Object({
  schemaVersion: Type.Literal("probe-suite.v1"),
  decision: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
  policyVersion: Type.String({ minLength: 1 }),
  bankVersion: Type.String({ minLength: 1 }),
  excludedProbeIds: Type.Array(Type.String()),
  regressionEvidenceRefs: Type.Array(Type.String()),
  runs: Type.Array(Type.Object({
    probeId: Type.String(),
    attemptId: Type.String(),
    status: ProbeRunStatusSchema,
    mergeable: Type.Literal(false),
    exclusionReason: Type.Optional(Type.String()),
    comparison: Type.Optional(Type.Object({
      regressionDetected: Type.Boolean(),
      effectSize: Type.Number(),
      confidence: Type.Number(),
      evidenceRefs: Type.Array(Type.String()),
    })),
    acceptanceEvidence: Type.Record(Type.String(), Type.Array(Type.String())),
  })),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
}, { additionalProperties: false });

export type ProbeSuiteResult = Static<typeof ProbeSuiteResultSchema>;

export interface ProbeAgentConfig {
  readonly model: string;
  readonly toolPolicyVersion: string;
  readonly tokenBudget: number;
  readonly wallClockBudgetMs: number;
  readonly promptVersion: string;
}

export interface ProbeBank {
  readonly bankVersion: string;
  readonly probes: readonly ProbeDefinition[];
}

function parse<T>(schema: TSchema, value: unknown, label: string): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid ${label}: ${error?.message || "schema mismatch"}`);
}

export function parseProbeDefinition(value: unknown): ProbeDefinition {
  return parse<ProbeDefinition>(ProbeDefinitionSchema, value, "probe contract");
}

export function parseProbeAttemptMetrics(value: unknown): ProbeAttemptMetrics {
  return parse<ProbeAttemptMetrics>(ProbeAttemptMetricsSchema, value, "probe attempt metrics");
}

export function probeAttemptEvidenceRef(metrics: ProbeAttemptMetrics): string {
  return `probe-attempt:${metrics.probeId}:${metrics.attemptId}:${metrics.revision}:${metrics.repeatIndex}`;
}
