export interface OraclePrediction {
  readonly releaseId: string;
  readonly predictedRisk: number;
  readonly oracleVersion: string;
}

export interface OracleOutcome {
  readonly releaseId: string;
  readonly actualCost: number;
}

export interface CalibrationSample {
  readonly prediction: OraclePrediction;
  readonly outcome: OracleOutcome;
}

export interface ThresholdVersion {
  readonly version: string;
  readonly thresholds: Readonly<Record<string, number>>;
  readonly evidenceScore: number;
  readonly heldOutScore: number;
  readonly shadowScore?: number;
}

export interface EvaluateOracleVersionOptions {
  readonly holdOutRatio?: number;
  readonly seed?: number;
}

export interface EvaluateOracleVersionResult {
  readonly samples: number;
  readonly trainScore: number;
  readonly holdOutScore: number;
  readonly heldOutReleaseIds: readonly string[];
}

export interface ThresholdComparison {
  readonly improves: boolean;
  readonly evidence: string;
}

export interface PromotionDecision {
  readonly promoted: boolean;
  readonly reason: string;
  readonly version: string;
}

export interface PromoteThresholdVersionInput {
  readonly current: ThresholdVersion;
  readonly candidate: ThresholdVersion;
  readonly evaluatorOracleId: string;
  readonly candidateOracleId: string;
  readonly heldOutImprovement: number;
  readonly minImprovement?: number;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

function predictionError(sample: CalibrationSample): number {
  return Math.abs(sample.prediction.predictedRisk - sample.outcome.actualCost);
}

function calibrationScore(samples: readonly CalibrationSample[]): number {
  if (samples.length === 0) return 0;
  const meanError = samples.reduce((sum, sample) => sum + predictionError(sample), 0) / samples.length;
  return Math.max(0, 1 - meanError);
}

export function evaluateOracleVersion(
  samples: readonly CalibrationSample[],
  options: EvaluateOracleVersionOptions = {},
): EvaluateOracleVersionResult {
  const holdOutRatio = options.holdOutRatio ?? 0.25;
  const holdOutCount = Math.max(1, Math.round(samples.length * holdOutRatio));
  const shuffled = seededShuffle(samples, options.seed ?? 1);
  const heldOut = shuffled.slice(0, holdOutCount);
  const train = shuffled.slice(holdOutCount);

  return {
    samples: samples.length,
    trainScore: calibrationScore(train),
    holdOutScore: calibrationScore(heldOut),
    heldOutReleaseIds: heldOut.map((sample) => sample.prediction.releaseId),
  };
}

export function preventsSelfPromotion(evaluatorOracleId: string, candidateOracleId: string): boolean {
  return evaluatorOracleId === candidateOracleId;
}

export function compareThresholdVersions(
  current: ThresholdVersion,
  candidate: ThresholdVersion,
): ThresholdComparison {
  const improves = candidate.heldOutScore > current.heldOutScore;
  const delta = candidate.heldOutScore - current.heldOutScore;
  const evidence = improves
    ? `Held-out calibration improved by ${delta.toFixed(3)} (${current.heldOutScore.toFixed(3)} -> ${candidate.heldOutScore.toFixed(3)})`
    : `Held-out calibration did not improve (${candidate.heldOutScore.toFixed(3)} <= ${current.heldOutScore.toFixed(3)})`;
  return { improves, evidence };
}

export function promoteThresholdVersion(input: PromoteThresholdVersionInput): PromotionDecision {
  if (preventsSelfPromotion(input.evaluatorOracleId, input.candidateOracleId)) {
    return {
      promoted: false,
      reason: "Rejected evaluator self-promotion",
      version: input.current.version,
    };
  }

  const comparison = compareThresholdVersions(input.current, input.candidate);
  const minImprovement = input.minImprovement ?? 0.05;
  if (!comparison.improves || input.heldOutImprovement < minImprovement) {
    return {
      promoted: false,
      reason: comparison.evidence,
      version: input.current.version,
    };
  }

  if (input.candidate.shadowScore !== undefined && input.candidate.shadowScore <= input.current.heldOutScore) {
    return {
      promoted: false,
      reason: "Shadow calibration did not exceed current held-out score",
      version: input.current.version,
    };
  }

  return {
    promoted: true,
    reason: comparison.evidence,
    version: input.candidate.version,
  };
}
