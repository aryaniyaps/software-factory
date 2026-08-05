import {
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { FactoryWorkflowInput } from "../client.js";
import { FACTORY_NODE_NAMES, type FactoryWorkflowState } from "./types.js";

const activity = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "5 minutes",
    maximumAttempts: 5,
    nonRetryableErrorTypes: ["PolicyViolation", "SecurityRejected", "InvalidTask"],
  },
});

export const cancelFactorySignal = defineSignal("cancelFactory");
export const retryFactoryNodeSignal = defineSignal<[string]>("retryFactoryNode");
export const factoryStatusQuery = defineQuery<FactoryWorkflowState>("factoryStatus");

export async function factoryWorkflow(input: FactoryWorkflowInput): Promise<FactoryWorkflowState> {
  const state: FactoryWorkflowState = { runId: input.runId, status: "running", completedNodes: [] };
  let cancelled = false;
  let requestedRetry: string | undefined;

  setHandler(cancelFactorySignal, () => { cancelled = true; });
  setHandler(retryFactoryNodeSignal, (node) => { requestedRetry = node; });
  setHandler(factoryStatusQuery, () => ({ ...state, completedNodes: [...state.completedNodes] }));

  const complete = (node: string) => state.completedNodes.push(node);
  const checkCancelled = () => {
    if (cancelled) {
      state.status = "cancelled";
      throw new Error("factory cancelled");
    }
  };

  try {
    const preparation = await activity.prepareRepository(input);
    complete("prepare_repository");
    checkCancelled();
    const worktree = await activity.createWorktree({ ...input, preparation });
    complete("create_worktree");
    checkCancelled();

    let previous: unknown = preparation;
    for (const role of ["scout", "plan", "implement"] as const) {
      const result = await activity.runAgent({ run: input, worktree, role, input: previous });
      previous = result.output;
      complete(role);
      checkCancelled();
    }

    const checks = await activity.runChecks({ run: input, worktree });
    complete("deterministic_checks");
    if (!checks.passed) {
      const repair = await activity.runAgent({ run: input, worktree, role: "repair", input: checks });
      previous = repair.output;
      complete("repair");
      const repairedChecks = await activity.runChecks({ run: input, worktree });
      if (!repairedChecks.passed) throw new Error("deterministic checks failed after repair");
    }

    await activity.runAgent({ run: input, worktree, role: "review", input: previous });
    complete("review");
    checkCancelled();
    const artifact = await activity.buildArtifact({ run: input, worktree });
    complete("build_artifact");
    await activity.deploy({ run: input, artifact });
    complete("deploy");
    complete("health_check");
    await activity.updateTaskStatus({ taskId: input.taskId, status: "Done", runId: input.runId });
    state.status = "succeeded";
    return state;
  } catch (error) {
    state.status = cancelled ? "cancelled" : "failed";
    state.failedNode = requestedRetry ?? FACTORY_NODE_NAMES[state.completedNodes.length];
    await activity.updateTaskStatus({ taskId: input.taskId, status: state.status, runId: input.runId });
    throw error;
  }
}
