import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { CorpusRunRecord } from "../../evaluation/corpus.js";
import type { ReplayEvaluator } from "../../evaluation/replay.js";
import type { FactoryChangeKind } from "../../evaluation/validity.js";
import type { ModelRoute } from "../../models/router.js";
import type { ModelObservation } from "../../models/weather-report.js";
import { TASK_QUEUES } from "../task-queues.js";

export const META_FACTORY_SCHEDULE_CRON = "0 3 * * 0";

const metaActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: { maximumAttempts: 2 },
  taskQueue: TASK_QUEUES.control,
});

export interface MetaFactoryWorkflowInput {
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

export interface MetaFactoryWorkflowResult {
  readonly promoted: boolean;
  readonly reason: string;
  readonly replayImproves: boolean;
  readonly gamingValid: boolean;
  readonly routeVersion?: string;
}

export async function metaFactoryWorkflow(
  input: MetaFactoryWorkflowInput,
): Promise<MetaFactoryWorkflowResult> {
  const evaluation = await metaActivities.runMetaEvaluation({
    runId: input.runId,
    corpusVersion: input.corpusVersion,
    corpusCases: input.corpusCases,
    baselineEvaluator: input.baselineEvaluator,
    candidateEvaluator: input.candidateEvaluator,
    changeId: input.changeId,
    changeKind: input.changeKind,
    evaluatorId: input.evaluatorId,
    candidateEvaluatorId: input.candidateEvaluatorId,
    weatherObservations: input.weatherObservations,
    currentRoute: input.currentRoute,
    candidateRoute: input.candidateRoute,
    shadowScore: input.shadowScore,
    canaryScore: input.canaryScore,
    canaryPercentage: input.canaryPercentage,
  });

  const promoted = evaluation.factoryPromotion.promoted
    || evaluation.routePromotion?.promoted === true;
  const reason = evaluation.routePromotion?.reason
    ?? evaluation.factoryPromotion.reason;

  return {
    promoted,
    reason,
    replayImproves: evaluation.replayImproves,
    gamingValid: evaluation.gamingValid,
    routeVersion: evaluation.routePromotion?.route.routeVersion
      ?? evaluation.selectedRoute?.routeVersion,
  };
}
