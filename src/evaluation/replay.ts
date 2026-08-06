import type { CorpusCase, CorpusVersion } from "./corpus.js";

export interface ReplayResult {
  readonly caseId: string;
  readonly evaluatorId: string;
  readonly success: boolean;
  readonly costTokens: number;
  readonly durationMs: number;
  readonly incidents: number;
  readonly maintainabilityDelta: number;
  readonly variance: number;
}

export interface ReplaySummary {
  readonly evaluatorId: string;
  readonly sampleCount: number;
  readonly successRate: number;
  readonly avgCost: number;
  readonly variance: number;
  readonly avgIncidents: number;
  readonly avgMaintainabilityDelta: number;
}

export interface ReplayComparison {
  readonly improves: boolean;
  readonly evidence: string;
  readonly deltas: {
    readonly successRate: number;
    readonly avgCost: number;
    readonly variance: number;
    readonly avgIncidents: number;
    readonly avgMaintainabilityDelta: number;
  };
}

export interface ReplayEvaluator {
  readonly id: string;
  replay(caseItem: CorpusCase): ReplayResult;
}

export function replayCorpus(
  corpus: CorpusVersion,
  evaluator: ReplayEvaluator,
): ReplayResult[] {
  return corpus.cases.map((caseItem) => evaluator.replay(caseItem));
}

export function summarizeReplayResults(results: readonly ReplayResult[]): ReplaySummary {
  if (results.length === 0) {
    return {
      evaluatorId: "unknown",
      sampleCount: 0,
      successRate: 0,
      avgCost: 0,
      variance: 0,
      avgIncidents: 0,
      avgMaintainabilityDelta: 0,
    };
  }

  const sampleCount = results.length;
  const successRate = results.filter((result) => result.success).length / sampleCount;
  const avgCost = results.reduce((sum, result) => sum + result.costTokens, 0) / sampleCount;
  const variance = results.reduce((sum, result) => sum + result.variance, 0) / sampleCount;
  const avgIncidents = results.reduce((sum, result) => sum + result.incidents, 0) / sampleCount;
  const avgMaintainabilityDelta = results.reduce((sum, result) => sum + result.maintainabilityDelta, 0) / sampleCount;

  return {
    evaluatorId: results[0]!.evaluatorId,
    sampleCount,
    successRate,
    avgCost,
    variance,
    avgIncidents,
    avgMaintainabilityDelta,
  };
}

function scoreSummary(summary: ReplaySummary): number {
  const costScore = summary.avgCost > 0 ? 1 / summary.avgCost : 0;
  return (
    summary.successRate * 0.4
    + (1 - summary.variance) * 0.2
    + (1 - summary.avgIncidents) * 0.2
    + summary.avgMaintainabilityDelta * 0.01
    + costScore * 10_000 * 0.2
  );
}

export function compareReplayOutcomes(
  baseline: ReplaySummary,
  candidate: ReplaySummary,
): ReplayComparison {
  const deltas = {
    successRate: candidate.successRate - baseline.successRate,
    avgCost: candidate.avgCost - baseline.avgCost,
    variance: candidate.variance - baseline.variance,
    avgIncidents: candidate.avgIncidents - baseline.avgIncidents,
    avgMaintainabilityDelta: candidate.avgMaintainabilityDelta - baseline.avgMaintainabilityDelta,
  };

  const improves = scoreSummary(candidate) > scoreSummary(baseline)
    && deltas.successRate >= 0
    && deltas.avgIncidents <= 0
    && deltas.variance <= 0;

  const evidence = improves
    ? `Replay improved success (${baseline.successRate.toFixed(3)} -> ${candidate.successRate.toFixed(3)}), cost (${baseline.avgCost.toFixed(0)} -> ${candidate.avgCost.toFixed(0)}), variance (${baseline.variance.toFixed(3)} -> ${candidate.variance.toFixed(3)}), incidents (${baseline.avgIncidents.toFixed(3)} -> ${candidate.avgIncidents.toFixed(3)}), maintainability (${baseline.avgMaintainabilityDelta.toFixed(3)} -> ${candidate.avgMaintainabilityDelta.toFixed(3)})`
    : `Replay did not improve across success, cost, variance, incident and maintainability effects`;

  return { improves, evidence, deltas };
}
