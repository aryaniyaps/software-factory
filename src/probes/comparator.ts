import type { Decision } from "../contracts/gates.js";
import {
  probeAttemptEvidenceRef,
  type ProbeAttemptMetrics,
  type ProbeComparisonResult,
  type ProbeDefinition,
  type ProbeRunRecord,
  type ProbeRunStatus,
  type ProbeSuiteResult,
} from "./types.js";

export const PROBE_COMPARISON_POLICY_VERSION = "probe-comparison.v1";

export interface ProbeComparisonPolicy {
  readonly policyVersion: string;
  readonly minEffectSize: number;
  readonly minConfidence: number;
  readonly maxVariance: number;
}

export const DEFAULT_PROBE_COMPARISON_POLICY: ProbeComparisonPolicy = {
  policyVersion: PROBE_COMPARISON_POLICY_VERSION,
  minEffectSize: 0.35,
  minConfidence: 0.7,
  maxVariance: 0.05,
};

export function computeDistribution(scores: readonly number[]): { mean: number; variance: number } {
  if (scores.length === 0) return { mean: 0, variance: 0 };
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
  return { mean, variance };
}

function successRate(repeats: readonly ProbeAttemptMetrics[]): number {
  if (repeats.length === 0) return 0;
  return repeats.filter((repeat) => repeat.success).length / repeats.length;
}

function meanMetric(
  repeats: readonly ProbeAttemptMetrics[],
  selector: (repeat: ProbeAttemptMetrics) => number,
): number {
  if (repeats.length === 0) return 0;
  return repeats.reduce((sum, repeat) => sum + selector(repeat), 0) / repeats.length;
}

function computeEffectSize(
  baselineRepeats: readonly ProbeAttemptMetrics[],
  candidateRepeats: readonly ProbeAttemptMetrics[],
): number {
  const baselineScores = baselineRepeats.map((repeat) => costScore(repeat));
  const candidateScores = candidateRepeats.map((repeat) => costScore(repeat));
  const baseline = computeDistribution(baselineScores);
  const candidate = computeDistribution(candidateScores);
  const pooled = Math.sqrt((baseline.variance + candidate.variance) / 2) || 1;
  return Math.abs(candidate.mean - baseline.mean) / pooled;
}

function costScore(repeat: ProbeAttemptMetrics): number {
  const successPenalty = repeat.success ? 0 : 1;
  return successPenalty
    + repeat.dispersion
    + repeat.publicApiGrowth * 0.25
    + repeat.regressions * 0.5
    + repeat.wallTimeMs / 1_000;
}

function computeConfidence(
  baselineRepeats: readonly ProbeAttemptMetrics[],
  candidateRepeats: readonly ProbeAttemptMetrics[],
  policy: ProbeComparisonPolicy,
): number {
  const sampleSize = baselineRepeats.length + candidateRepeats.length;
  const baselineVariance = computeDistribution(
    baselineRepeats.map((repeat) => costScore(repeat)),
  ).variance;
  const candidateVariance = computeDistribution(
    candidateRepeats.map((repeat) => costScore(repeat)),
  ).variance;
  const variancePenalty = Math.max(baselineVariance, candidateVariance) / Math.max(policy.maxVariance, 0.01);
  const sampleConfidence = Math.min(1, sampleSize / 6);
  return Math.max(0, Math.min(1, sampleConfidence * (1 - Math.min(1, variancePenalty))));
}

function buildComparisonEvidenceRefs(
  probe: ProbeDefinition,
  baselineRepeats: readonly ProbeAttemptMetrics[],
  candidateRepeats: readonly ProbeAttemptMetrics[],
): string[] {
  return [
    ...baselineRepeats.map((repeat) => probeAttemptEvidenceRef(repeat)),
    ...candidateRepeats.map((repeat) => probeAttemptEvidenceRef(repeat)),
    `probe-comparison:${probe.id}:${baselineRepeats[0]?.attemptId ?? "unknown"}`,
  ];
}

export function compareProbeDistributions(
  probe: ProbeDefinition,
  baselineRepeats: readonly ProbeAttemptMetrics[],
  candidateRepeats: readonly ProbeAttemptMetrics[],
  policy: ProbeComparisonPolicy = DEFAULT_PROBE_COMPARISON_POLICY,
): ProbeComparisonResult {
  const baselineSuccessRate = successRate(baselineRepeats);
  const candidateSuccessRate = successRate(candidateRepeats);
  const baselineMeanWallTimeMs = meanMetric(baselineRepeats, (repeat) => repeat.wallTimeMs);
  const candidateMeanWallTimeMs = meanMetric(candidateRepeats, (repeat) => repeat.wallTimeMs);
  const baselineDispersion = meanMetric(baselineRepeats, (repeat) => repeat.dispersion);
  const candidateDispersion = meanMetric(candidateRepeats, (repeat) => repeat.dispersion);
  const effectSize = computeEffectSize(baselineRepeats, candidateRepeats);
  const confidence = computeConfidence(baselineRepeats, candidateRepeats, policy);
  const successRegression = baselineSuccessRate > candidateSuccessRate;
  const timeRegression = candidateMeanWallTimeMs > baselineMeanWallTimeMs * 1.25;
  const dispersionRegression = candidateDispersion > baselineDispersion + 0.2;
  const regressionDetected = (successRegression || timeRegression || dispersionRegression)
    && effectSize >= policy.minEffectSize
    && confidence >= policy.minConfidence;
  const evidenceRefs = buildComparisonEvidenceRefs(probe, baselineRepeats, candidateRepeats);

  return {
    regressionDetected,
    effectSize,
    confidence,
    baselineSuccessRate,
    candidateSuccessRate,
    baselineMeanWallTimeMs,
    candidateMeanWallTimeMs,
    baselineDispersion,
    candidateDispersion,
    evidenceRefs,
  };
}

export function classifyProbeVariance(
  probe: ProbeDefinition,
  baselineRepeats: readonly ProbeAttemptMetrics[],
  candidateRepeats: readonly ProbeAttemptMetrics[],
  policy: ProbeComparisonPolicy = DEFAULT_PROBE_COMPARISON_POLICY,
): { noisy: boolean; variance: number } {
  const maxVariance = probe.maxVariance ?? policy.maxVariance;
  const baselineVariance = computeDistribution(
    baselineRepeats.map((repeat) => (repeat.success ? 1 : 0)),
  ).variance;
  const candidateVariance = computeDistribution(
    candidateRepeats.map((repeat) => (repeat.success ? 1 : 0)),
  ).variance;
  const variance = Math.max(baselineVariance, candidateVariance);
  return { noisy: variance > maxVariance, variance };
}

function buildAcceptanceEvidence(
  probe: ProbeDefinition,
  baselineRepeats: readonly ProbeAttemptMetrics[],
  candidateRepeats: readonly ProbeAttemptMetrics[],
): Record<string, string[]> {
  const evidence: Record<string, string[]> = {};
  const refs = [
    ...baselineRepeats.map((repeat) => probeAttemptEvidenceRef(repeat)),
    ...candidateRepeats.map((repeat) => probeAttemptEvidenceRef(repeat)),
  ];
  for (const acceptanceId of probe.acceptance) {
    evidence[acceptanceId] = refs;
  }
  return evidence;
}

export function buildProbeRunRecord(input: {
  probe: ProbeDefinition;
  attemptId: string;
  status: ProbeRunStatus;
  baselineRepeats: readonly ProbeAttemptMetrics[];
  candidateRepeats: readonly ProbeAttemptMetrics[];
  comparison?: ProbeComparisonResult;
  exclusionReason?: string;
}): ProbeRunRecord {
  return {
    probeId: input.probe.id,
    attemptId: input.attemptId,
    status: input.status,
    mergeable: false,
    baselineRepeats: input.baselineRepeats,
    candidateRepeats: input.candidateRepeats,
    comparison: input.comparison,
    exclusionReason: input.exclusionReason,
    acceptanceEvidence: buildAcceptanceEvidence(
      input.probe,
      input.baselineRepeats,
      input.candidateRepeats,
    ),
  };
}

export function decideProbeSuiteOutcome(runs: readonly ProbeRunRecord[]): Decision {
  const actionable = runs.filter((run) => run.status !== "invalid" && run.status !== "noisy" && run.status !== "excluded");
  if (actionable.some((run) => run.comparison?.regressionDetected)) return "fail";
  if (runs.some((run) => run.status === "invalid" || run.status === "noisy")) return "pass";
  if (actionable.every((run) => run.status === "succeeded")) return "pass";
  if (actionable.some((run) => run.status === "failed")) return "fail";
  return "pass";
}

export function buildProbeSuiteResult(
  runs: readonly ProbeRunRecord[],
  evidenceRefs: readonly string[],
  options: {
    policyVersion?: string;
    bankVersion?: string;
  } = {},
): ProbeSuiteResult {
  const excludedProbeIds = runs
    .filter((run) => run.status === "invalid" || run.status === "noisy" || run.status === "excluded")
    .map((run) => run.probeId);
  const regressionEvidenceRefs = runs.flatMap((run) => run.comparison?.evidenceRefs ?? []);
  return {
    schemaVersion: "probe-suite.v1",
    decision: decideProbeSuiteOutcome(runs),
    policyVersion: options.policyVersion ?? PROBE_COMPARISON_POLICY_VERSION,
    bankVersion: options.bankVersion ?? "probe-bank.v1",
    excludedProbeIds,
    regressionEvidenceRefs,
    runs: runs.map((run) => ({
      probeId: run.probeId,
      attemptId: run.attemptId,
      status: run.status,
      mergeable: false,
      exclusionReason: run.exclusionReason,
      comparison: run.comparison
        ? {
          regressionDetected: run.comparison.regressionDetected,
          effectSize: run.comparison.effectSize,
          confidence: run.comparison.confidence,
          evidenceRefs: [...run.comparison.evidenceRefs],
        }
        : undefined,
      acceptanceEvidence: Object.fromEntries(
        Object.entries(run.acceptanceEvidence).map(([key, value]) => [key, [...value]]),
      ),
    })),
    evidenceRefs: [...new Set([...evidenceRefs, ...regressionEvidenceRefs])],
  };
}
