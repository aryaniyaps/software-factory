import type { RiskTier } from "../policy/work-policy.js";

export interface ModelObservation {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly role: string;
  readonly taskType: string;
  readonly riskTier: RiskTier;
  readonly successRate: number;
  readonly avgCost: number;
  readonly variance: number;
  readonly incidentRate: number;
  readonly maintainabilityEffect: number;
  readonly sampleCount: number;
  readonly evidenceVersion: string;
}

export interface WeatherReport {
  readonly reportVersion: string;
  readonly generatedAt: string;
  readonly observations: readonly ModelObservation[];
}

function observationScore(observation: ModelObservation): number {
  const costScore = observation.avgCost > 0 ? 1 / observation.avgCost : 0;
  return (
    observation.successRate * 0.35
    + (1 - observation.variance) * 0.15
    + (1 - observation.incidentRate) * 0.2
    + observation.maintainabilityEffect * 0.05
    + Math.min(observation.sampleCount / 100, 1) * 0.1
    + costScore * 10_000 * 0.15
  );
}

export function buildWeatherReport(
  reportVersion: string,
  observations: readonly ModelObservation[],
  generatedAt = new Date().toISOString(),
): WeatherReport {
  const sorted = [...observations].sort((left, right) => {
    const role = left.role.localeCompare(right.role);
    if (role !== 0) return role;
    const task = left.taskType.localeCompare(right.taskType);
    if (task !== 0) return task;
    const risk = left.riskTier.localeCompare(right.riskTier);
    if (risk !== 0) return risk;
    return left.modelId.localeCompare(right.modelId);
  });

  return {
    reportVersion,
    generatedAt,
    observations: sorted,
  };
}

export function rankObservationsForRoute(
  report: WeatherReport,
  query: { readonly role: string; readonly taskType: string; readonly riskTier: RiskTier },
): ModelObservation[] {
  return report.observations
    .filter((observation) =>
      observation.role === query.role
      && observation.taskType === query.taskType
      && observation.riskTier === query.riskTier)
    .sort((left, right) => observationScore(right) - observationScore(left) || left.modelId.localeCompare(right.modelId));
}

export function bestObservationForRoute(
  report: WeatherReport,
  query: { readonly role: string; readonly taskType: string; readonly riskTier: RiskTier },
): ModelObservation | undefined {
  return rankObservationsForRoute(report, query)[0];
}

export function routeEvidenceScore(observation: ModelObservation): number {
  return observationScore(observation);
}
