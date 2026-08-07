import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { FactoryWorkflowInput } from "../client.js";
import type { ArtifactResult } from "../activities/types.js";
import { DEFAULT_CANARY_POLICY, currentStage, hasNextStage, nextStageIndex } from "../../release/canary-policy.js";
import { DEFAULT_OBSERVATION_POLICY, evaluateObservation } from "../../release/observation.js";
import { buildRollbackPlan, shouldRollback } from "../../release/rollback.js";
import { canPromote, transition, type ReleaseState } from "../../release/states.js";
import { TASK_QUEUES } from "../task-queues.js";

const deployActivity = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: { maximumAttempts: 1 },
  taskQueue: TASK_QUEUES.deploy,
});

export interface ReleaseWorkflowInput {
  run: FactoryWorkflowInput;
  artifact: ArtifactResult;
}

export interface ReleaseWorkflowResult {
  status: "promoted" | "rolled_back" | "failed";
  releaseState: ReleaseState;
  deploymentId: string;
  digest: string;
  rolledBackDigest?: string;
  observationReasons?: readonly string[];
}

function advanceState(state: ReleaseState, event: Parameters<typeof transition>[1]): ReleaseState {
  const next = transition(state, event);
  if (!next) throw new Error(`illegal release transition: ${state} -> ${event}`);
  return next;
}

export async function releaseWorkflow(input: ReleaseWorkflowInput): Promise<ReleaseWorkflowResult> {
  const deploymentId = `${input.run.runId}-${input.artifact.digest}`;
  let releaseState: ReleaseState = "built";
  const digest = input.artifact.digest;

  releaseState = advanceState(releaseState, "provenance_passed");
  const preview = await deployActivity.deployPreview({ run: input.run, artifact: input.artifact, deploymentId });
  const previousDigest = preview.previousDigest;
  if (!previousDigest) {
    return { status: "failed", releaseState, deploymentId, digest, observationReasons: ["missing_previous_digest"] };
  }
  releaseState = advanceState(releaseState, "preview_deployed");

  const verification = await deployActivity.verifyRelease({
    run: input.run,
    artifact: input.artifact,
    previewUrl: preview.previewUrl,
    deploymentId,
  });
  if (!verification.passed) {
    return { status: "failed", releaseState, deploymentId, digest, observationReasons: verification.reasons };
  }
  releaseState = advanceState(releaseState, "release_verified");

  let stageIndex = 0;
  while (true) {
    const stage = currentStage(DEFAULT_CANARY_POLICY, stageIndex);
    await deployActivity.deployCanary({
      run: input.run,
      artifact: input.artifact,
      deploymentId,
      percentage: stage.percentage,
      stageIndex,
    });
    if (releaseState === "release_verified") {
      releaseState = advanceState(releaseState, "canary_deployed");
    }

    await sleep(stage.observationWindowMs);
    const signals = await deployActivity.observeDeployment({
      run: input.run,
      deploymentId,
      digest,
      healthUrl: preview.healthUrl,
    });
    const observation = evaluateObservation({
      policy: DEFAULT_OBSERVATION_POLICY,
      technical: signals.technical,
      semantic: signals.semantic,
    });

    if (shouldRollback(observation)) {
      releaseState = advanceState(releaseState, "observation_failed");
      const plan = buildRollbackPlan({ deploymentId, candidateDigest: digest, previousDigest });
      const rollback = await deployActivity.rollbackDeployment({
        run: input.run,
        deploymentId,
        candidateDigest: digest,
        targetDigest: previousDigest,
        idempotencyKey: plan.idempotencyKey,
        healthUrl: preview.healthUrl,
      });
      releaseState = advanceState(releaseState, "rollback_completed");
      return {
        status: "rolled_back",
        releaseState,
        deploymentId,
        digest,
        rolledBackDigest: rollback.digest,
        observationReasons: observation.reasons,
      };
    }

    if (observation.decision === "insufficient") {
      return { status: "failed", releaseState, deploymentId, digest, observationReasons: observation.reasons };
    }

    if (hasNextStage(DEFAULT_CANARY_POLICY, stageIndex)) {
      stageIndex = nextStageIndex(stageIndex);
      continue;
    }

    if (releaseState === "canary") {
      releaseState = advanceState(releaseState, "observation_started");
    }
    if (canPromote(releaseState, observation)) {
      releaseState = advanceState(releaseState, "promotion_completed");
      return { status: "promoted", releaseState, deploymentId, digest };
    }
    return { status: "failed", releaseState, deploymentId, digest, observationReasons: observation.reasons };
  }
}
