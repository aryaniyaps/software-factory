export const MAINTAINABILITY_DIMENSIONS = [
  "modularity",
  "information_hiding",
  "analysability",
  "modifiability",
  "testability",
  "reusability",
  "operational_evolvability",
] as const;

export type MaintainabilityDimension = (typeof MAINTAINABILITY_DIMENSIONS)[number];

export type FitnessSeverity = "block" | "warn" | "info";

export type FitnessCapability =
  | "architecture_rules"
  | "modularity_graph"
  | "type_surface"
  | "lint_conventions"
  | "dead_code"
  | "clone_detection"
  | "mutation_testing"
  | "change_history";

export type FitnessOutcome = "pass" | "policy_block" | "insufficient_evidence";

export interface SourceLocation {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly symbol?: string;
}

export interface FitnessFinding {
  readonly id: string;
  readonly adapterId: string;
  readonly ruleId: string;
  readonly dimension: MaintainabilityDimension;
  readonly severity: FitnessSeverity;
  readonly confidence: number;
  readonly baseline?: number;
  readonly candidate?: number;
  readonly delta?: number;
  readonly locations: readonly SourceLocation[];
  readonly evidenceRefs: readonly string[];
  readonly explanation: string;
  readonly shadowOnly?: boolean;
}

export interface RepositoryContext {
  readonly repoRoot: string;
  readonly languages: readonly string[];
  readonly primaryLanguage?: string;
}

export interface FitnessInput {
  readonly context: RepositoryContext;
  readonly baselineRoot?: string;
  readonly candidateRoot: string;
  readonly changedFiles?: readonly string[];
  readonly evidenceManifestId?: string;
}

export interface FitnessAdapter {
  readonly id: string;
  readonly version: string;
  readonly capability: FitnessCapability;
  supports(context: RepositoryContext): Promise<boolean>;
  measure(input: FitnessInput): Promise<readonly FitnessFinding[]>;
}

export interface FitnessRawSubScore {
  readonly adapterId: string;
  readonly metric: string;
  readonly baseline?: number;
  readonly candidate?: number;
  readonly delta?: number;
  readonly raw: unknown;
}

export interface FitnessRunResult {
  readonly outcome: FitnessOutcome;
  readonly policyVersion: string;
  readonly shadowMode: boolean;
  readonly findings: readonly FitnessFinding[];
  readonly rawSubScores: readonly FitnessRawSubScore[];
  readonly missingCapabilities: readonly FitnessCapability[];
}

export interface AdapterCommandConfig {
  readonly command: string;
  readonly args: readonly string[];
}

export interface FitnessPolicy {
  readonly schemaVersion: "fitness-policy.v1";
  readonly policyVersion: string;
  readonly shadowMode: {
    readonly enabled: boolean;
    readonly successfulRunsRemaining: number;
  };
  readonly execution: {
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
  };
  readonly requiredCapabilities: readonly FitnessCapability[];
  readonly hardRuleIds: readonly string[];
  readonly shadowRuleIds: readonly string[];
  readonly adapters: Readonly<Record<string, AdapterCommandConfig>>;
}

export function createFinding(
  partial: Omit<FitnessFinding, "id"> & { id?: string },
): FitnessFinding {
  const locationKey = partial.locations
    .map((location) => [location.file, location.line, location.symbol].filter(Boolean).join(":"))
    .join("|");
  const id = partial.id ?? `${partial.adapterId}:${partial.ruleId}:${locationKey}`;
  return { ...partial, id };
}

export function supportsTypeScript(context: RepositoryContext): boolean {
  return context.languages.some((language) =>
  language === "typescript" || language === "javascript");
}
