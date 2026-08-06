import {
  buildCorpusFromRuns,
  buildCorpusVersion,
  type CorpusRunRecord,
  type CorpusVersion,
} from "../../evaluation/corpus.js";
import {
  compareReplayOutcomes,
  replayCorpus,
  summarizeReplayResults,
  type ReplayEvaluator,
  type ReplaySummary,
} from "../../evaluation/replay.js";
import {
  canPromoteFactoryChange,
  runGamingAgents,
  validateEvaluatorOutcome,
  type FactoryChangeKind,
  type PromoteFactoryChangeDecision,
} from "../../evaluation/validity.js";
import {
  advanceCanaryRoute,
  promoteModelRoute,
  rollbackModelRoute,
  selectModelRoute,
  startShadowRoute,
  type ModelRoute,
} from "../../models/router.js";
import { buildWeatherReport, type ModelObservation } from "../../models/weather-report.js";

export interface RunMetaEvaluationInput {
  readonly runId: string;
  readonly corpusVersion: string;
  readonly corpusCases: readonly CorpusRunRecord[];
  readonly baselineEvaluator: ReplayEvaluator;
  readonly candidateEvaluator: ReplayEvaluator;
  readonly changeId: string;
  readonly changeKind: FactoryChangeKind;
  readonly evaluatorId: string;
  readonly candidateEvaluatorId: string;
  readonly weatherObservations: readonly ModelObservation[];
  readonly currentRoute?: ModelRoute;
  readonly candidateRoute?: ModelRoute;
  readonly shadowScore?: number;
  readonly canaryScore?: number;
  readonly canaryPercentage?: number;
}

export interface RunMetaEvaluationResult {
  readonly corpus: CorpusVersion;
  readonly baseline: ReplaySummary;
  readonly candidate: ReplaySummary;
  readonly replayImproves: boolean;
  readonly gamingValid: boolean;
  readonly factoryPromotion: PromoteFactoryChangeDecision;
  readonly selectedRoute?: ModelRoute;
  readonly routePromotion?: ReturnType<typeof promoteModelRoute>;
  readonly rolledBackRoute?: ModelRoute;
}

export function runMetaEvaluation(input: RunMetaEvaluationInput): RunMetaEvaluationResult {
  const corpus = input.corpusCases.length > 0
    ? buildCorpusFromRuns(input.corpusVersion, input.corpusCases)
    : buildCorpusVersion(input.corpusVersion, []);

  const baselineResults = replayCorpus(corpus, input.baselineEvaluator);
  const candidateResults = replayCorpus(corpus, input.candidateEvaluator);
  const baseline = summarizeReplayResults(baselineResults);
  const candidate = summarizeReplayResults(candidateResults);
  const replayComparison = compareReplayOutcomes(baseline, candidate);

  const gamingResults = runGamingAgents(corpus);
  const gamingValidation = validateEvaluatorOutcome({
    corpus,
    replaySummary: candidate,
    gamingSummaries: gamingResults.map((result) => result.summary),
  });

  const factoryPromotion = canPromoteFactoryChange({
    changeId: input.changeId,
    changeKind: input.changeKind,
    evaluatorId: input.evaluatorId,
    candidateEvaluatorId: input.candidateEvaluatorId,
    replayImproves: replayComparison.improves && gamingValidation.valid,
    shadowScore: input.shadowScore ?? candidate.successRate,
    canaryScore: input.canaryScore ?? candidate.successRate,
    currentScore: baseline.successRate,
  });

  const report = buildWeatherReport(`weather:${input.runId}`, input.weatherObservations);
  const selectedRoute = report.observations.length > 0
    ? selectModelRoute(report, {
      role: input.weatherObservations[0]!.role,
      taskType: input.weatherObservations[0]!.taskType,
      riskTier: input.weatherObservations[0]!.riskTier,
    })
    : undefined;

  let routePromotion: ReturnType<typeof promoteModelRoute> | undefined;
  let rolledBackRoute: ModelRoute | undefined;

  if (input.currentRoute && input.candidateRoute) {
    const shadowed = startShadowRoute(input.currentRoute, input.candidateRoute);
    const canaried = advanceCanaryRoute(shadowed, input.canaryPercentage ?? 10);
    routePromotion = promoteModelRoute({
      current: input.currentRoute,
      candidate: {
        ...input.candidateRoute,
        shadowScore: input.shadowScore ?? input.candidateRoute.evidenceScore,
        canaryPercentage: canaried.canaryPercentage,
      },
      evaluatorId: input.evaluatorId,
      candidateEvaluatorId: input.candidateEvaluatorId,
      minImprovement: 0.05,
    });

    if (!routePromotion.promoted) {
      rolledBackRoute = rollbackModelRoute(canaried, input.currentRoute);
    }
  }

  return {
    corpus,
    baseline,
    candidate,
    replayImproves: replayComparison.improves,
    gamingValid: gamingValidation.valid,
    factoryPromotion,
    selectedRoute,
    routePromotion,
    rolledBackRoute,
  };
}

export interface MetaFactoryActivityDependencies {
  readonly runMetaEvaluation?: typeof runMetaEvaluation;
}

export function createMetaFactoryActivities(deps: MetaFactoryActivityDependencies = {}) {
  const evaluate = deps.runMetaEvaluation ?? runMetaEvaluation;

  return {
    async runMetaEvaluation(input: RunMetaEvaluationInput): Promise<RunMetaEvaluationResult> {
      return evaluate(input);
    },
  };
}

export type MetaFactoryActivities = ReturnType<typeof createMetaFactoryActivities>;
