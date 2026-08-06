import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { MAINTAINABILITY_DIMENSIONS, type MaintainabilityDimension } from "../fitness/types.js";

export const SMELL_TAXONOMY = {
  change_amplification: [
    "shotgun_surgery",
    "divergent_change",
    "parallel_hierarchies",
    "data_clumps",
    "primitive_obsession",
    "temporal_coupling",
  ],
  coupling_boundaries: [
    "dependency_cycle",
    "forbidden_direction",
    "feature_envy",
    "inappropriate_intimacy",
    "message_chain",
    "middle_man_pass_through",
    "unstable_public_surface",
    "leaky_abstraction",
  ],
  cognitive_control_flow: [
    "long_complex_function",
    "large_module_class",
    "long_parameter_list",
    "complex_conditional",
    "switch_on_type_variant",
    "temporary_field_partial_state",
    "boolean_blindness",
  ],
  dispensables: [
    "duplicate_code_knowledge",
    "dead_code",
    "speculative_generality",
    "lazy_module",
    "comment_deodorant",
    "data_only_module",
  ],
  test_smells: [
    "missing_behavior_coverage",
    "non_discriminating_tests",
    "broad_mocks",
    "flaky_tests",
    "wrong_tier_tests",
    "meaningless_assertions",
    "implementation_coupled_tests",
    "hidden_acceptance_tampering",
    "weak_mutation_sensitivity",
    "nondeterministic_tests",
  ],
  operational: [
    "non_idempotent_retryable_side_effect",
    "missing_timeout_cancellation",
    "unbounded_retries",
    "untyped_errors",
    "missing_durable_state_record",
    "undigested_artifact",
    "deploy_without_rollback",
    "premature_success",
    "missing_correlation_telemetry",
    "sandbox_secrets_network",
  ],
} as const satisfies Record<string, readonly string[]>;

export type SmellCategoryGroup = keyof typeof SMELL_TAXONOMY;
export type SmellCategory = (typeof SMELL_TAXONOMY)[SmellCategoryGroup][number];

const ALL_SMELLS = Object.values(SMELL_TAXONOMY).flat() as readonly SmellCategory[];
const SmellCategorySchema = Type.Union(ALL_SMELLS.map((category) => Type.Literal(category)) as TSchema[]);
const MaintainabilityDimensionSchema = Type.Union(
  MAINTAINABILITY_DIMENSIONS.map((dimension) => Type.Literal(dimension)) as TSchema[],
);

export const AESTHETIC_ONLY_SMELLS = new Set<SmellCategory>([
  "long_complex_function",
  "large_module_class",
  "long_parameter_list",
  "complex_conditional",
  "switch_on_type_variant",
  "temporary_field_partial_state",
  "boolean_blindness",
  "data_clumps",
  "middle_man_pass_through",
  "lazy_module",
  "comment_deodorant",
  "feature_envy",
  "message_chain",
  "divergent_change",
]);

export const CriticSeveritySchema = Type.Union([
  Type.Literal("block"),
  Type.Literal("warn"),
  Type.Literal("info"),
]);

export const CriticFindingSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  category: SmellCategorySchema,
  severity: CriticSeveritySchema,
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  dimension: MaintainabilityDimensionSchema,
  affectedSymbols: Type.Array(Type.String({ minLength: 1 })),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 })),
  violatedInvariant: Type.String(),
  minimumRepair: Type.String(),
  falsificationCondition: Type.String(),
  explanation: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const CriticReportSchema = Type.Object({
  schemaVersion: Type.Literal("critic-report.v1"),
  criticId: Type.String({ minLength: 1 }),
  findings: Type.Array(CriticFindingSchema),
}, { additionalProperties: false });

export type CriticSeverity = Static<typeof CriticSeveritySchema>;
export type CriticFinding = Readonly<Static<typeof CriticFindingSchema>>;
export type CriticReport = Readonly<Static<typeof CriticReportSchema>>;

function parse<T>(schema: TSchema, value: unknown, label: string): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid ${label}: ${error?.message || "schema mismatch"}`);
}

function assertBlockingEvidence(finding: CriticFinding): void {
  if (finding.severity !== "block") return;
  if (finding.evidenceRefs.length === 0) {
    throw new Error("Invalid critic finding: blocking findings require evidenceRefs");
  }
  if (finding.affectedSymbols.length === 0) {
    throw new Error("Invalid critic finding: blocking findings require affectedSymbols");
  }
  if (finding.violatedInvariant.trim().length === 0) {
    throw new Error("Invalid critic finding: blocking findings require violatedInvariant");
  }
  if (finding.falsificationCondition.trim().length === 0) {
    throw new Error("Invalid critic finding: blocking findings require falsificationCondition");
  }
}

function looksAestheticOnly(finding: CriticFinding): boolean {
  if (!AESTHETIC_ONLY_SMELLS.has(finding.category)) return false;
  const prose = `${finding.explanation} ${finding.violatedInvariant}`.toLowerCase();
  const hasConcreteAnchor = finding.affectedSymbols.some((symbol) => symbol.includes("::") || symbol.includes("/"));
  const aestheticMarkers = ["feels", "messy", "hard to read", "unclear", "ugly", "aesthetic"];
  return aestheticMarkers.some((marker) => prose.includes(marker)) || !hasConcreteAnchor;
}

export function normalizeCriticFinding(finding: CriticFinding): CriticFinding {
  assertBlockingEvidence(finding);
  if (finding.severity === "block" && (AESTHETIC_ONLY_SMELLS.has(finding.category) || looksAestheticOnly(finding))) {
    return { ...finding, severity: "warn" };
  }
  return finding;
}

export function parseCriticFinding(value: unknown): CriticFinding {
  const finding = parse<CriticFinding>(CriticFindingSchema, value, "critic finding");
  return normalizeCriticFinding(finding);
}

export function parseCriticReport(value: unknown): CriticReport {
  const report = parse<CriticReport>(CriticReportSchema, value, "critic report");
  return {
    ...report,
    findings: report.findings.map((finding) => normalizeCriticFinding(finding)),
  };
}

export function isBlockingFinding(finding: CriticFinding): boolean {
  return finding.severity === "block";
}

export function findingKey(finding: CriticFinding): string {
  return `${finding.category}:${finding.affectedSymbols.slice().sort().join(",")}`;
}

export function dimensionForCategory(category: SmellCategory): MaintainabilityDimension {
  const mapping: Partial<Record<SmellCategory, MaintainabilityDimension>> = {
    dependency_cycle: "modularity",
    forbidden_direction: "modularity",
    missing_behavior_coverage: "testability",
    non_idempotent_retryable_side_effect: "operational_evolvability",
  };
  return mapping[category] ?? "modularity";
}
