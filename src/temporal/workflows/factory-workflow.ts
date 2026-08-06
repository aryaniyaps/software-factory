import {
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { FactoryWorkflowInput } from "../client.js";
import { TASK_QUEUES } from "../task-queues.js";
import { FACTORY_NODE_NAMES, type FactoryWorkflowState } from "./types.js";

const activityOptions = {
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "5 minutes",
    maximumAttempts: 5,
    nonRetryableErrorTypes: ["PolicyViolation", "SecurityRejected", "InvalidTask"],
  },
};

const controlActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.control });
const agentActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.agent });
const buildActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.build });
const deployActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.deploy });

export const cancelFactorySignal = defineSignal("cancelFactory");
export const factoryStatusQuery = defineQuery<FactoryWorkflowState>("factoryStatus");

export async function factoryWorkflow(input: FactoryWorkflowInput): Promise<FactoryWorkflowState> {
  const state: FactoryWorkflowState = { runId: input.runId, status: "running", completedNodes: [] };
  let cancelled = false;
  setHandler(cancelFactorySignal, () => { cancelled = true; });
  setHandler(factoryStatusQuery, () => ({ ...state, completedNodes: [...state.completedNodes] }));

  const complete = (node: string) => state.completedNodes.push(node);
  const checkCancelled = () => {
    if (cancelled) {
      state.status = "cancelled";
      throw new Error("factory cancelled");
    }
  };

  try {
    const preparation = await controlActivity.prepareRepository(input);
    complete("prepare_repository");
    checkCancelled();
    const worktree = await controlActivity.createWorktree({ ...input, preparation });
    complete("create_worktree");
    checkCancelled();
    const security = await controlActivity.securityScan({ run: input, worktree });
    if (!security.passed) throw new Error(`security scan failed: ${security.findings.join(", ")}`);
    complete("security_scan");
    checkCancelled();

    let previous: unknown = preparation;
    for (const role of ["scout", "plan", "implement"] as const) {
      const result = await agentActivity.runAgent({ run: input, worktree, role, input: previous });
      previous = result.output;
      complete(role);
      checkCancelled();
    }

    const checks = await buildActivity.runChecks({ run: input, worktree });
    complete("deterministic_checks");
    if (!checks.passed) {
      const repair = await agentActivity.runAgent({ run: input, worktree, role: "repair", input: checks });
      previous = repair.output;
      complete("repair");
      const repairedChecks = await buildActivity.runChecks({ run: input, worktree });
      if (!repairedChecks.passed) throw new Error("deterministic checks failed after repair");
    }

    await agentActivity.runAgent({ run: input, worktree, role: "review", input: previous });
    complete("review");
    checkCancelled();
    const artifact = await buildActivity.buildArtifact({ run: input, worktree });
    complete("build_artifact");
    const deployment = await deployActivity.deploy({ run: input, artifact });
    complete("deploy");
    const health = await deployActivity.healthCheck({ run: input, url: deployment.healthUrl, digest: artifact.digest });
    if (!health.healthy) throw new Error(`health check failed: ${health.url}`);
    complete("health_check");
    await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "Done", runId: input.runId });
    state.status = "succeeded";
    return state;
  } catch (error) {
    state.status = cancelled ? "cancelled" : "failed";
    state.failedNode = FACTORY_NODE_NAMES[state.completedNodes.length];
    await controlActivity.updateTaskStatus({ taskId: input.taskId, status: state.status, runId: input.runId });
    throw error;
  }
}
