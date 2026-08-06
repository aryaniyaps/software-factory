export const POLICY_VERSION = "policy.v1";

export const RISK_TIERS = ["T0", "T1", "T2", "T3"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export interface CanaryPolicy {
  readonly required: boolean;
  readonly minTrafficPercent: number;
  readonly maxRollbackWindowMs: number;
}

export interface ObservationPolicy {
  readonly durationMs: number;
  readonly requiredSignals: readonly string[];
}

export interface ConcurrencyPolicy {
  readonly maxConcurrentRunsPerRepo: number;
  readonly maxConcurrentPerPhase: Readonly<Record<string, number>>;
}

export interface WorkPolicy {
  readonly policyVersion: string;
  readonly riskTier: RiskTier;
  readonly requiredGates: readonly string[];
  readonly requiredCritics: number;
  readonly requiredProbeCount: number;
  readonly maxAgentAttempts: number;
  readonly maxRepairAttempts: number;
  readonly tokenBudget: number;
  readonly wallClockBudgetMs: number;
  readonly canaryPolicy: CanaryPolicy;
  readonly observationPolicy: ObservationPolicy;
  readonly concurrency: ConcurrencyPolicy;
}

const T0_GATES = ["deterministic_checks"] as const;
const T1_GATES = ["deterministic_checks", "maintainability_assess"] as const;
const T2_GATES = ["deterministic_checks", "maintainability_assess", "behavioral_verify"] as const;
const T3_GATES = [
  "deterministic_checks",
  "maintainability_assess",
  "behavioral_verify",
  "security_scan",
  "provenance_verify",
  "fault_simulation",
] as const;

export const TIER_POLICIES: Readonly<Record<RiskTier, WorkPolicy>> = {
  T0: {
    policyVersion: POLICY_VERSION,
    riskTier: "T0",
    requiredGates: T0_GATES,
    requiredCritics: 0,
    requiredProbeCount: 0,
    maxAgentAttempts: 6,
    maxRepairAttempts: 0,
    tokenBudget: 100_000,
    wallClockBudgetMs: 10 * 60 * 1000,
    canaryPolicy: { required: false, minTrafficPercent: 0, maxRollbackWindowMs: 0 },
    observationPolicy: { durationMs: 0, requiredSignals: [] },
    concurrency: { maxConcurrentRunsPerRepo: 3, maxConcurrentPerPhase: { implement: 2 } },
  },
  T1: {
    policyVersion: POLICY_VERSION,
    riskTier: "T1",
    requiredGates: T1_GATES,
    requiredCritics: 0,
    requiredProbeCount: 0,
    maxAgentAttempts: 12,
    maxRepairAttempts: 2,
    tokenBudget: 500_000,
    wallClockBudgetMs: 30 * 60 * 1000,
    canaryPolicy: { required: false, minTrafficPercent: 0, maxRollbackWindowMs: 0 },
    observationPolicy: { durationMs: 5 * 60 * 1000, requiredSignals: ["health"] },
    concurrency: { maxConcurrentRunsPerRepo: 2, maxConcurrentPerPhase: { implement: 1 } },
  },
  T2: {
    policyVersion: POLICY_VERSION,
    riskTier: "T2",
    requiredGates: T2_GATES,
    requiredCritics: 1,
    requiredProbeCount: 2,
    maxAgentAttempts: 16,
    maxRepairAttempts: 2,
    tokenBudget: 750_000,
    wallClockBudgetMs: 45 * 60 * 1000,
    canaryPolicy: { required: true, minTrafficPercent: 5, maxRollbackWindowMs: 15 * 60 * 1000 },
    observationPolicy: { durationMs: 15 * 60 * 1000, requiredSignals: ["health", "slo"] },
    concurrency: { maxConcurrentRunsPerRepo: 2, maxConcurrentPerPhase: { implement: 1, deploy: 1 } },
  },
  T3: {
    policyVersion: POLICY_VERSION,
    riskTier: "T3",
    requiredGates: T3_GATES,
    requiredCritics: 2,
    requiredProbeCount: 4,
    maxAgentAttempts: 20,
    maxRepairAttempts: 2,
    tokenBudget: 1_000_000,
    wallClockBudgetMs: 60 * 60 * 1000,
    canaryPolicy: { required: true, minTrafficPercent: 10, maxRollbackWindowMs: 30 * 60 * 1000 },
    observationPolicy: { durationMs: 30 * 60 * 1000, requiredSignals: ["health", "slo", "security"] },
    concurrency: { maxConcurrentRunsPerRepo: 1, maxConcurrentPerPhase: { implement: 1, deploy: 1 } },
  },
};

export function tierPolicy(tier: RiskTier): WorkPolicy {
  return TIER_POLICIES[tier];
}

export function mergeWorkPolicy(base: WorkPolicy, overrides: Partial<WorkPolicy>): WorkPolicy {
  const mergedGates = overrides.requiredGates
    ? [...new Set([...base.requiredGates, ...overrides.requiredGates])]
    : base.requiredGates;

  return {
    ...base,
    ...overrides,
    policyVersion: base.policyVersion,
    riskTier: base.riskTier,
    requiredGates: mergedGates,
    requiredCritics: Math.max(base.requiredCritics, overrides.requiredCritics ?? base.requiredCritics),
    requiredProbeCount: Math.max(base.requiredProbeCount, overrides.requiredProbeCount ?? base.requiredProbeCount),
    maxAgentAttempts: overrides.maxAgentAttempts ?? base.maxAgentAttempts,
    maxRepairAttempts: overrides.maxRepairAttempts ?? base.maxRepairAttempts,
    tokenBudget: overrides.tokenBudget ?? base.tokenBudget,
    wallClockBudgetMs: overrides.wallClockBudgetMs ?? base.wallClockBudgetMs,
    canaryPolicy: overrides.canaryPolicy ?? base.canaryPolicy,
    observationPolicy: overrides.observationPolicy ?? base.observationPolicy,
    concurrency: overrides.concurrency ?? base.concurrency,
  };
}
