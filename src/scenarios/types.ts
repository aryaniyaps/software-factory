import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";

export const SCENARIO_TYPES = [
  "api",
  "cli",
  "browser",
  "contract",
  "migration",
  "failure",
  "performance",
  "security",
] as const;

export const ScenarioTypeSchema = Type.Union([
  Type.Literal("api"),
  Type.Literal("cli"),
  Type.Literal("browser"),
  Type.Literal("contract"),
  Type.Literal("migration"),
  Type.Literal("failure"),
  Type.Literal("performance"),
  Type.Literal("security"),
]);
export type ScenarioType = Static<typeof ScenarioTypeSchema>;

export const ScenarioModeSchema = Type.Union([Type.Literal("behavior"), Type.Literal("refactor")]);
export type ScenarioMode = Static<typeof ScenarioModeSchema>;

export const ScenarioAdapterSchema = Type.Object({
  command: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Array(Type.String())),
}, { additionalProperties: false });

export const ScenarioDefinitionSchema = Type.Object({
  schemaVersion: Type.Literal("scenario.v1"),
  id: Type.String({ pattern: "^SCN-[A-Z0-9][A-Z0-9-]*$" }),
  title: Type.String({ minLength: 1 }),
  type: ScenarioTypeSchema,
  mode: ScenarioModeSchema,
  acceptance: Type.Array(Type.String({ pattern: "^AC-[A-Z0-9][A-Z0-9-]*$" }), { minItems: 1 }),
  adapter: ScenarioAdapterSchema,
  repeats: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  minSatisfaction: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  maxVariance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
}, { additionalProperties: false });

export type ScenarioDefinition = Static<typeof ScenarioDefinitionSchema>;

export const TrajectoryStepSchema = Type.Object({
  index: Type.Integer({ minimum: 0 }),
  action: Type.String({ minLength: 1 }),
  outcome: Type.Union([Type.Literal("ok"), Type.Literal("error")]),
  detail: Type.Optional(Type.String()),
  timestamp: Type.String({ format: "date-time" }),
}, { additionalProperties: false });

export type TrajectoryStep = Static<typeof TrajectoryStepSchema>;

export const ScenarioTrajectorySchema = Type.Object({
  schemaVersion: Type.Literal("scenario-trajectory.v1"),
  scenarioId: Type.String({ minLength: 1 }),
  attemptId: Type.String({ minLength: 1 }),
  revision: Type.Union([Type.Literal("baseline"), Type.Literal("candidate")]),
  repeatIndex: Type.Integer({ minimum: 0 }),
  steps: Type.Array(TrajectoryStepSchema),
  adapterOutput: Type.Object({
    exitCode: Type.Integer(),
    stdout: Type.String(),
    stderr: Type.String(),
  }, { additionalProperties: false }),
  satisfied: Type.Boolean(),
}, { additionalProperties: false });

export type ScenarioTrajectory = Static<typeof ScenarioTrajectorySchema>;

export const ScenarioRunStatusSchema = Type.Union([
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("invalid"),
  Type.Literal("noisy"),
]);

export type ScenarioRunStatus = Static<typeof ScenarioRunStatusSchema>;

export interface ScenarioRepeatOutcome {
  readonly trajectory: ScenarioTrajectory;
  readonly satisfaction: number;
}

export interface ScenarioRunRecord {
  readonly scenarioId: string;
  readonly attemptId: string;
  readonly status: ScenarioRunStatus;
  readonly satisfied: boolean;
  readonly satisfaction: number;
  readonly variance: number;
  readonly trajectories: readonly ScenarioTrajectory[];
  readonly acceptanceEvidence: Readonly<Record<string, readonly string[]>>;
}

export interface ScenarioDistribution {
  readonly scenarioId: string;
  readonly runs: number;
  readonly satisfactionMean: number;
  readonly satisfactionVariance: number;
}

export const ScenarioSuiteResultSchema = Type.Object({
  schemaVersion: Type.Literal("scenario-suite.v1"),
  decision: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("abstain")]),
  policyVersion: Type.String({ minLength: 1 }),
  runs: Type.Array(Type.Object({
    scenarioId: Type.String(),
    attemptId: Type.String(),
    status: ScenarioRunStatusSchema,
    satisfied: Type.Boolean(),
    satisfaction: Type.Number(),
    variance: Type.Number(),
    acceptanceEvidence: Type.Record(Type.String(), Type.Array(Type.String())),
  })),
  distributions: Type.Array(Type.Object({
    scenarioId: Type.String(),
    runs: Type.Integer(),
    satisfactionMean: Type.Number(),
    satisfactionVariance: Type.Number(),
  })),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
}, { additionalProperties: false });

export type ScenarioSuiteResult = Static<typeof ScenarioSuiteResultSchema>;

function parse<T>(schema: TSchema, value: unknown): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid scenario contract: ${error?.message || "schema mismatch"}`);
}

export function parseScenarioDefinition(value: unknown): ScenarioDefinition {
  return parse<ScenarioDefinition>(ScenarioDefinitionSchema, value);
}

export function parseScenarioTrajectory(value: unknown): ScenarioTrajectory {
  return parse<ScenarioTrajectory>(ScenarioTrajectorySchema, value);
}
