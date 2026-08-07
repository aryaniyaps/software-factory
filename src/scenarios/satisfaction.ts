import type { Decision } from "../contracts/gates.js";
import type {
  ScenarioDefinition,
  ScenarioDistribution,
  ScenarioRepeatOutcome,
  ScenarioRunRecord,
  ScenarioRunStatus,
  ScenarioSuiteResult,
  ScenarioTrajectory,
} from "./types.js";

export const SCENARIO_POLICY_VERSION = "scenario-verifier.v1";

export interface SatisfactionThresholds {
  readonly minSatisfaction: number;
  readonly maxVariance: number;
}

export function defaultThresholds(scenario: ScenarioDefinition): SatisfactionThresholds {
  return {
    minSatisfaction: scenario.minSatisfaction ?? 0.95,
    maxVariance: scenario.maxVariance ?? 0.05,
  };
}

export function trajectorySatisfaction(trajectory: ScenarioTrajectory): number {
  return trajectory.satisfied ? 1 : 0;
}

export function computeDistribution(scores: readonly number[]): { mean: number; variance: number } {
  if (scores.length === 0) return { mean: 0, variance: 0 };
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
  return { mean, variance };
}

export function evaluateRevisionOutcomes(
  scenario: ScenarioDefinition,
  revision: "baseline" | "candidate",
  repeats: readonly ScenarioRepeatOutcome[],
): { satisfied: boolean; mean: number; variance: number } {
  const scores = repeats.map((repeat) => repeat.satisfaction);
  const { mean, variance } = computeDistribution(scores);
  const thresholds = defaultThresholds(scenario);
  const satisfied = mean >= thresholds.minSatisfaction && variance <= thresholds.maxVariance;
  if (scenario.mode === "behavior" && revision === "baseline") {
    return { satisfied: mean < thresholds.minSatisfaction, mean, variance };
  }
  if (scenario.mode === "refactor") {
    return { satisfied: mean >= thresholds.minSatisfaction && variance <= thresholds.maxVariance, mean, variance };
  }
  return { satisfied, mean, variance };
}

export function classifyScenarioRun(
  scenario: ScenarioDefinition,
  baselineRepeats: readonly ScenarioRepeatOutcome[],
  candidateRepeats: readonly ScenarioRepeatOutcome[],
): { status: ScenarioRunStatus; satisfied: boolean; satisfaction: number; variance: number } {
  const baseline = evaluateRevisionOutcomes(scenario, "baseline", baselineRepeats);
  const candidate = evaluateRevisionOutcomes(scenario, "candidate", candidateRepeats);
  const combinedScores = [
    ...baselineRepeats.map((repeat) => repeat.satisfaction),
    ...candidateRepeats.map((repeat) => repeat.satisfaction),
  ];
  const distribution = computeDistribution(combinedScores);
  const thresholds = defaultThresholds(scenario);

  if (candidate.variance > thresholds.maxVariance || baseline.variance > thresholds.maxVariance) {
    return {
      status: "noisy",
      satisfied: false,
      satisfaction: candidate.mean,
      variance: candidate.variance,
    };
  }

  const behaviorOk = scenario.mode === "behavior"
    ? baseline.satisfied && candidate.satisfied
    : baseline.satisfied && candidate.satisfied;

  if (!behaviorOk) {
    return {
      status: "failed",
      satisfied: false,
      satisfaction: candidate.mean,
      variance: candidate.variance,
    };
  }

  return {
    status: "succeeded",
    satisfied: true,
    satisfaction: candidate.mean,
    variance: candidate.variance,
  };
}

export function buildAcceptanceEvidence(
  scenario: ScenarioDefinition,
  trajectories: readonly ScenarioTrajectory[],
): Record<string, string[]> {
  const evidence: Record<string, string[]> = {};
  for (const acceptanceId of scenario.acceptance) {
    evidence[acceptanceId] = trajectories.map(
      (trajectory) => `trajectory:${trajectory.scenarioId}:${trajectory.attemptId}:${trajectory.revision}:${trajectory.repeatIndex}`,
    );
  }
  return evidence;
}

export function buildScenarioRunRecord(
  scenario: ScenarioDefinition,
  attemptId: string,
  baselineRepeats: readonly ScenarioRepeatOutcome[],
  candidateRepeats: readonly ScenarioRepeatOutcome[],
): ScenarioRunRecord {
  const classification = classifyScenarioRun(scenario, baselineRepeats, candidateRepeats);
  const trajectories = [...baselineRepeats, ...candidateRepeats].map((repeat) => repeat.trajectory);
  return {
    scenarioId: scenario.id,
    attemptId,
    status: classification.status,
    satisfied: classification.satisfied,
    satisfaction: classification.satisfaction,
    variance: classification.variance,
    trajectories,
    acceptanceEvidence: buildAcceptanceEvidence(scenario, trajectories),
  };
}

export function buildDistributions(runs: readonly ScenarioRunRecord[]): ScenarioDistribution[] {
  return runs.map((run) => ({
    scenarioId: run.scenarioId,
    runs: run.trajectories.length,
    satisfactionMean: run.satisfaction,
    satisfactionVariance: run.variance,
  }));
}

export function decideSuiteOutcome(runs: readonly ScenarioRunRecord[]): Decision {
  if (runs.some((run) => run.status === "invalid" || run.status === "noisy")) return "fail";
  if (runs.every((run) => run.status === "succeeded" && run.satisfied)) return "pass";
  return "fail";
}

export function buildSuiteResult(
  runs: readonly ScenarioRunRecord[],
  evidenceRefs: readonly string[],
  policyVersion = SCENARIO_POLICY_VERSION,
): ScenarioSuiteResult {
  return {
    schemaVersion: "scenario-suite.v1",
    decision: decideSuiteOutcome(runs),
    policyVersion,
    runs: runs.map((run) => ({
      scenarioId: run.scenarioId,
      attemptId: run.attemptId,
      status: run.status,
      satisfied: run.satisfied,
      satisfaction: run.satisfaction,
      variance: run.variance,
      acceptanceEvidence: Object.fromEntries(
        Object.entries(run.acceptanceEvidence).map(([key, value]) => [key, [...value]]),
      ),
    })),
    distributions: buildDistributions(runs),
    evidenceRefs: [...evidenceRefs],
  };
}

export function markInvalidScenario(
  scenarioId: string,
  attemptId: string,
  reason: string,
): ScenarioRunRecord {
  const trajectory: ScenarioTrajectory = {
    schemaVersion: "scenario-trajectory.v1",
    scenarioId,
    attemptId,
    revision: "candidate",
    repeatIndex: 0,
    steps: [{
      index: 0,
      action: "validate",
      outcome: "error",
      detail: reason,
      timestamp: new Date().toISOString(),
    }],
    adapterOutput: { exitCode: 1, stdout: "", stderr: reason },
    satisfied: false,
  };
  return {
    scenarioId,
    attemptId,
    status: "invalid",
    satisfied: false,
    satisfaction: 0,
    variance: 0,
    trajectories: [trajectory],
    acceptanceEvidence: {},
  };
}
