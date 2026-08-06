import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { CalibrationSample, ThresholdVersion } from "../../assurance/calibration.js";
import type {
  MaintenanceOutcome,
  ReleaseRecord,
  RepositoryHealthLoopResult,
} from "../../health/repository-health.js";
import type { ChurnEntry, CommitFileChanges } from "../../health/hotspots.js";
import { TASK_QUEUES } from "../task-queues.js";

export const REPOSITORY_HEALTH_SCHEDULE_CRON = "0 2 * * *";

const healthActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: { maximumAttempts: 2 },
  taskQueue: TASK_QUEUES.control,
});

export interface RepositoryHealthWorkflowInput {
  readonly runId: string;
  readonly repositoryRoot: string;
  readonly probeBankRoot: string;
  readonly probeCount: number;
  readonly releases: readonly ReleaseRecord[];
  readonly outcomes: Readonly<Record<string, MaintenanceOutcome>>;
  readonly calibrationSamples: readonly CalibrationSample[];
  readonly currentThresholds: ThresholdVersion;
  readonly candidateThresholds?: ThresholdVersion;
  readonly evaluatorOracleId: string;
  readonly candidateOracleId: string;
  readonly workOrderSequence: number;
}

export interface RepositoryHealthWorkflowResult {
  readonly loop: RepositoryHealthLoopResult;
  readonly calibration: {
    readonly heldOutScore: number;
    readonly promotedVersion: string;
    readonly promoted: boolean;
    readonly reason: string;
  };
}

export async function repositoryHealthWorkflow(
  input: RepositoryHealthWorkflowInput,
): Promise<RepositoryHealthWorkflowResult> {
  const churn = await healthActivities.collectRepositoryChurn({
    runId: input.runId,
    repositoryRoot: input.repositoryRoot,
  });
  const commits = await healthActivities.collectRepositoryCoChanges({
    runId: input.runId,
    repositoryRoot: input.repositoryRoot,
  });
  const probeIds = await healthActivities.sampleNightlyProbes({
    runId: input.runId,
    probeBankRoot: input.probeBankRoot,
    probeCount: input.probeCount,
  });

  const loop = await healthActivities.runRepositoryHealthLoop({
    runId: input.runId,
    repositoryRoot: input.repositoryRoot,
    churnEntries: churn.entries as ChurnEntry[],
    commitFileChanges: commits.commits as CommitFileChanges[],
    releases: input.releases,
    outcomes: input.outcomes,
    probeIds: probeIds.probeIds,
    workOrderSequence: input.workOrderSequence,
  });

  const calibration = await healthActivities.calibrateOracleThresholds({
    runId: input.runId,
    samples: input.calibrationSamples,
    current: input.currentThresholds,
    candidate: input.candidateThresholds,
    evaluatorOracleId: input.evaluatorOracleId,
    candidateOracleId: input.candidateOracleId,
  });

  for (const workOrder of loop.workOrders) {
    await healthActivities.enqueueDebtWorkOrder({
      runId: input.runId,
      workOrder,
    });
  }

  return {
    loop,
    calibration: {
      heldOutScore: calibration.heldOutScore,
      promotedVersion: calibration.promotedVersion,
      promoted: calibration.promoted,
      reason: calibration.reason,
    },
  };
}
