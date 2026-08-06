import {
  ApplicationFailure,
  continueAsNew,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { AgentActivityResult } from "../activities/types.js";
import type { FactoryNodeName } from "../../contracts/nodes.js";
import { DEFAULT_WORKFLOW_BUDGET } from "../../policy/retry-policy.js";
import { TASK_QUEUES } from "../task-queues.js";
import { runRepairLoop } from "./repair-loop.js";
import { runNodeAttempt, runNodeWithRetry } from "./run-node.js";
import {
  FACTORY_NODE_NAMES,
  MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW,
  recordAttempt,
  succeededNodes,
  toBudgetState,
  type FactoryWorkflowContinuationInput,
  type FactoryWorkflowState,
} from "./types.js";

const activityOptions = {
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "5 minutes",
    maximumAttempts: 1,
    nonRetryableErrorTypes: ["PolicyViolation", "SecurityRejected", "InvalidTask"],
  },
};

const controlActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.control });
const agentActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.agent });
const buildActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.build });
const deployActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.deploy });

export const cancelFactorySignal = defineSignal("cancelFactory");
export const rerunNodeSignal = defineSignal<[FactoryNodeName]>("rerunNode");
export const factoryStatusQuery = defineQuery<FactoryWorkflowState>("factoryStatus");

function agentSucceeded(output: { status: "succeeded" | "failed" | "abstained"; summary: string }): boolean {
  return output.status === "succeeded";
}

export async function factoryWorkflow(input: FactoryWorkflowContinuationInput): Promise<FactoryWorkflowState> {
  const continuation = input.continuation;
  const state: {
    schemaVersion: "factory-run.v1";
    runId: string;
    status: FactoryWorkflowState["status"];
    nodeAttempts: FactoryWorkflowState["nodeAttempts"];
    currentNode?: FactoryNodeName;
    failedNode?: FactoryNodeName;
    continuationGeneration: number;
    budget: typeof DEFAULT_WORKFLOW_BUDGET;
  } = {
    schemaVersion: "factory-run.v1",
    runId: input.runId,
    status: "running",
    nodeAttempts: continuation?.nodeAttempts ?? [],
    continuationGeneration: continuation?.continuationGeneration ?? 0,
    budget: continuation?.budget ?? { ...DEFAULT_WORKFLOW_BUDGET },
  };

  let cancelled = false;
  let pendingRerun: FactoryNodeName | undefined;
  setHandler(cancelFactorySignal, () => { cancelled = true; });
  setHandler(rerunNodeSignal, (node) => { pendingRerun = node; });
  setHandler(factoryStatusQuery, (): FactoryWorkflowState => ({
    schemaVersion: state.schemaVersion,
    runId: state.runId,
    status: state.status,
    completedNodes: succeededNodes(state.nodeAttempts),
    nodeAttempts: [...state.nodeAttempts],
    currentNode: state.currentNode,
    failedNode: state.failedNode,
    budget: toBudgetState(state.budget),
    continuationGeneration: state.continuationGeneration,
  }));

  const checkCancelled = () => {
    if (cancelled) {
      state.status = "cancelled";
      throw ApplicationFailure.nonRetryable("factory cancelled", "Cancelled");
    }
  };

  const maybeContinueAsNew = async (worktree?: { path: string; branch: string }, agentOutput?: object) => {
    if (state.nodeAttempts.length < MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW) return;
    await continueAsNew<typeof factoryWorkflow>({
      ...input,
      continuation: {
        nodeAttempts: state.nodeAttempts,
        budget: state.budget,
        continuationGeneration: state.continuationGeneration + 1,
        worktree,
        agentOutput,
      },
    });
  };

  const recordAttempts = (attempts: readonly { node: FactoryNodeName; attemptId: string; status: "succeeded" | "failed" | "cancelled" }[]) => {
    for (const attempt of attempts) {
      state.nodeAttempts = recordAttempt(state.nodeAttempts, attempt);
    }
  };

  const abstain = async (failedNode?: FactoryNodeName, worktreePath?: string) => {
    state.status = "abstained";
    state.failedNode = failedNode;
    if (worktreePath) await controlActivity.removeWorktree(worktreePath);
    await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "abstained", runId: input.runId });
    return buildFinalState(state);
  };

  const failRun = async (failedNode: FactoryNodeName, worktreePath?: string): Promise<FactoryWorkflowState> => {
    state.status = "failed";
    state.failedNode = failedNode;
    if (worktreePath) await controlActivity.removeWorktree(worktreePath);
    await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "failed", runId: input.runId });
    throw ApplicationFailure.nonRetryable(`factory failed at ${failedNode}`, "Failed", { failedNode });
  };

  let activeWorktreePath = continuation?.worktree?.path;

  try {
    let worktree = continuation?.worktree;
    let previous: object = continuation?.agentOutput ?? {};

    if (!worktree) {
      state.currentNode = "prepare_repository";
      const prepAttempt = await runNodeAttempt({
        runId: input.runId,
        node: "prepare_repository",
        attemptNumber: 1,
        budget: state.budget,
        execute: () => controlActivity.prepareRepository(input),
      });
      state.budget = prepAttempt.budget;
      state.nodeAttempts = recordAttempt(state.nodeAttempts, prepAttempt.attemptRef);
      if (prepAttempt.result.status === "failed") {
        return await failRun("prepare_repository");
      }
      const preparation = prepAttempt.result.output!;
      checkCancelled();

      state.currentNode = "create_worktree";
      const worktreeAttempt = await runNodeAttempt({
        runId: input.runId,
        node: "create_worktree",
        attemptNumber: 1,
        budget: state.budget,
        execute: () => controlActivity.createWorktree({ ...input, preparation }),
      });
      state.budget = worktreeAttempt.budget;
      state.nodeAttempts = recordAttempt(state.nodeAttempts, worktreeAttempt.attemptRef);
      if (worktreeAttempt.result.status === "failed") {
        return await failRun("create_worktree");
      }
      worktree = worktreeAttempt.result.output!;
      activeWorktreePath = worktree.path;
      previous = preparation;
      checkCancelled();
    }

    state.currentNode = "security_scan";
    const securityAttempt = await runNodeWithRetry({
      runId: input.runId,
      node: "security_scan",
      budget: state.budget,
      maxAttempts: 2,
      execute: async () => {
        const security = await controlActivity.securityScan({ run: input, worktree: worktree! });
        if (!security.passed) {
          const error = new Error(`security scan failed: ${security.findings.join(", ")}`);
          error.name = "SecurityRejected";
          throw error;
        }
        return security;
      },
    });
    state.budget = securityAttempt.budget;
    recordAttempts(securityAttempt.attemptRefs);
    if (securityAttempt.abstained) return await abstain("security_scan", worktree.path);
    if (securityAttempt.failed) return await failRun("security_scan", worktree.path);
    checkCancelled();
    await maybeContinueAsNew(worktree, previous);

    const agentRoles = ["scout", "plan", "implement"] as const;
    for (const role of agentRoles) {
      if (pendingRerun && pendingRerun !== role) continue;
      if (pendingRerun === role) pendingRerun = undefined;

      state.currentNode = role;
      const agentRun = await runNodeWithRetry({
        runId: input.runId,
        node: role,
        budget: state.budget,
        maxAttempts: 2,
        execute: async () => {
          const result = await agentActivity.runAgent({ run: input, worktree: worktree!, role, input: previous });
          if (!agentSucceeded(result.output)) {
            const failedOutput = result.output;
            const error = new Error(`${role} agent ${failedOutput.status}: ${failedOutput.summary}`);
            error.name = failedOutput.status === "abstained" ? "BudgetExhausted" : "PolicyViolation";
            throw error;
          }
          return result;
        },
        tokensUsed: (result) => 0,
      });
      state.budget = agentRun.budget;
      recordAttempts(agentRun.attemptRefs);
      if (agentRun.abstained) return await abstain(role, worktree.path);
      if (agentRun.failed) return await failRun(role, worktree.path);
      previous = (agentRun.output as AgentActivityResult).output.data;
      checkCancelled();
      await maybeContinueAsNew(worktree, previous);
    }

    state.currentNode = "deterministic_checks";
    const repairLoop = await runRepairLoop({
      runId: input.runId,
      budget: state.budget,
      maxRepairAttempts: state.budget.maxRepairAttempts,
      runChecks: () => buildActivity.runChecks({ run: input, worktree: worktree! }),
      runRepair: async (repairAttempt) => {
        const repair = await agentActivity.runAgent({ run: input, worktree: worktree!, role: "repair", input: { previous } });
        if (!agentSucceeded(repair.output)) {
          const failedOutput = repair.output;
          const error = new Error(`repair agent ${failedOutput.status}: ${failedOutput.summary}`);
          error.name = failedOutput.status === "abstained" ? "BudgetExhausted" : "PolicyViolation";
          throw error;
        }
        return repair.output;
      },
    });
    state.budget = repairLoop.budget;
    recordAttempts(repairLoop.checksAttempts);
    recordAttempts(repairLoop.repairAttempts);
    if (repairLoop.abstained) return await abstain("deterministic_checks", worktree.path);
    if (!repairLoop.passed) return await failRun("deterministic_checks", worktree.path);
    if (repairLoop.repairOutput) previous = repairLoop.repairOutput.data;
    checkCancelled();
    await maybeContinueAsNew(worktree, previous);

    state.currentNode = "review";
    const reviewRun = await runNodeWithRetry({
      runId: input.runId,
      node: "review",
      budget: state.budget,
      maxAttempts: 2,
      execute: async () => {
        const review = await agentActivity.runAgent({ run: input, worktree: worktree!, role: "review", input: previous });
        if (!agentSucceeded(review.output)) {
          const failedOutput = review.output;
          const error = new Error(`review gate failed: ${failedOutput.summary}`);
          error.name = "PolicyViolation";
          throw error;
        }
        return review;
      },
    });
    state.budget = reviewRun.budget;
    recordAttempts(reviewRun.attemptRefs);
    if (reviewRun.abstained) return await abstain("review", worktree.path);
    if (reviewRun.failed) return await failRun("review", worktree.path);
    checkCancelled();
    await maybeContinueAsNew(worktree, previous);

    state.currentNode = "build_artifact";
    const buildAttempt = await runNodeAttempt({
      runId: input.runId,
      node: "build_artifact",
      attemptNumber: 1,
      budget: state.budget,
      execute: () => buildActivity.buildArtifact({ run: input, worktree: worktree! }),
    });
    state.budget = buildAttempt.budget;
    state.nodeAttempts = recordAttempt(state.nodeAttempts, buildAttempt.attemptRef);
    if (buildAttempt.result.status === "failed") return await failRun("build_artifact", worktree.path);
    const artifact = buildAttempt.result.output!;
    checkCancelled();

    state.currentNode = "deploy";
    const deployAttempt = await runNodeAttempt({
      runId: input.runId,
      node: "deploy",
      attemptNumber: 1,
      budget: state.budget,
      execute: () => deployActivity.deploy({ run: input, artifact }),
    });
    state.budget = deployAttempt.budget;
    state.nodeAttempts = recordAttempt(state.nodeAttempts, deployAttempt.attemptRef);
    if (deployAttempt.result.status === "failed") return await failRun("deploy", worktree.path);
    const deployment = deployAttempt.result.output!;
    checkCancelled();

    state.currentNode = "health_check";
    const healthAttempt = await runNodeWithRetry({
      runId: input.runId,
      node: "health_check",
      budget: state.budget,
      maxAttempts: 2,
      execute: async () => {
        const health = await deployActivity.healthCheck({ run: input, url: deployment.healthUrl, digest: artifact.digest });
        if (!health.healthy) throw new Error(`health check failed: ${health.url}`);
        return health;
      },
    });
    state.budget = healthAttempt.budget;
    recordAttempts(healthAttempt.attemptRefs);
    if (healthAttempt.abstained) return await abstain("health_check", worktree.path);
    if (healthAttempt.failed) return await failRun("health_check", worktree.path);

    await controlActivity.removeWorktree(worktree.path);
    await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "Done", runId: input.runId });
    state.status = "succeeded";
    state.currentNode = undefined;
    return buildFinalState(state);
  } catch (error) {
    if (state.status === "cancelled") {
      if (activeWorktreePath) await controlActivity.removeWorktree(activeWorktreePath);
      await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "cancelled", runId: input.runId });
      throw ApplicationFailure.nonRetryable("factory cancelled", "Cancelled");
    }
    throw error;
  }
}

function buildFinalState(state: {
  schemaVersion: "factory-run.v1";
  runId: string;
  status: FactoryWorkflowState["status"];
  nodeAttempts: FactoryWorkflowState["nodeAttempts"];
  currentNode?: FactoryNodeName;
  failedNode?: FactoryNodeName;
  continuationGeneration: number;
  budget: typeof DEFAULT_WORKFLOW_BUDGET;
}): FactoryWorkflowState {
  return {
    schemaVersion: state.schemaVersion,
    runId: state.runId,
    status: state.status,
    completedNodes: succeededNodes(state.nodeAttempts),
    nodeAttempts: [...state.nodeAttempts],
    currentNode: state.currentNode,
    failedNode: state.failedNode,
    budget: toBudgetState(state.budget),
    continuationGeneration: state.continuationGeneration,
  };
}

export { FACTORY_NODE_NAMES };
