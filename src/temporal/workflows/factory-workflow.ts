import {
  ApplicationFailure,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  uuid4,
} from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { AgentActivityResult } from "../activities/types.js";
import type { AgentOutput } from "../../contracts/nodes.js";
import type { ClarificationAnswer, ClarificationRequest } from "../../contracts/clarification.js";
import type { FactoryNodeName } from "../../contracts/nodes.js";
import { DEFAULT_WORKFLOW_BUDGET } from "../../policy/retry-policy.js";
import { assessMaintainability, DEFAULT_MAINTAINABILITY_POLICY } from "../../assurance/maintainability/policy.js";
import { assessCriticReports, stripImplementerNarrative } from "../../assurance/maintainability/critic.js";
import type { FitnessRunResult } from "../../assurance/fitness/types.js";
import { TASK_QUEUES } from "../task-queues.js";
import { runRepairLoop } from "./repair-loop.js";
import { runMaintainabilityLoop } from "./maintainability-loop.js";
import { runNodeAttempt, runNodeWithRetry } from "./run-node.js";
import { releaseWorkflow } from "./release-workflow.js";
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
    nonRetryableErrorTypes: ["PolicyViolation", "SecurityRejected", "InvalidTask", "HumanEscalation"],
  },
};

const controlActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.control });
const agentActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.agent });
const buildActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.build });
const verifierActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.verifier });

export const cancelFactorySignal = defineSignal("cancelFactory");
export const rerunNodeSignal = defineSignal<[FactoryNodeName]>("rerunNode");
export const rollbackReleaseSignal = defineSignal("rollbackRelease");
export const answerClarificationSignal = defineSignal<[ClarificationAnswer]>("answerClarification");
export const factoryStatusQuery = defineQuery<FactoryWorkflowState>("factoryStatus");

function agentSucceeded(output: { status: "succeeded" | "failed" | "escalate_to_human"; summary: string }): boolean {
  return output.status === "succeeded";
}

function agentFailureName(status: "failed" | "escalate_to_human"): string {
  if (status === "escalate_to_human") return "HumanEscalation";
  return "PolicyViolation";
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
    pendingClarification?: ClarificationRequest;
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
  const attemptsAtGenerationStart = state.nodeAttempts.length;

  let cancelled = false;
  let pendingRollback = false;
  let pendingRerun: FactoryNodeName | undefined;
  let pendingAnswer: ClarificationAnswer | undefined;
  setHandler(cancelFactorySignal, () => { cancelled = true; });
  setHandler(rollbackReleaseSignal, () => { pendingRollback = true; });
  setHandler(rerunNodeSignal, (node) => { pendingRerun = node; });
  setHandler(answerClarificationSignal, (answer) => {
    if (
      state.pendingClarification?.requestId === answer.requestId
      && state.pendingClarification.stateRevision === answer.stateRevision
    ) {
      pendingAnswer = answer;
    }
  });
  setHandler(factoryStatusQuery, (): FactoryWorkflowState => ({
    schemaVersion: state.schemaVersion,
    runId: state.runId,
    status: state.status,
    completedNodes: succeededNodes(state.nodeAttempts),
    nodeAttempts: [...state.nodeAttempts],
    currentNode: state.currentNode,
    failedNode: state.failedNode,
    pendingClarification: state.pendingClarification,
    budget: toBudgetState(state.budget),
    continuationGeneration: state.continuationGeneration,
  }));

  const checkCancelled = () => {
    if (cancelled) {
      state.status = "cancelled";
      throw ApplicationFailure.nonRetryable("factory cancelled", "Cancelled");
    }
    if (pendingRollback) {
      state.status = "rolled_back";
      state.failedNode = state.currentNode;
      throw ApplicationFailure.nonRetryable("release rollback requested", "RollbackRequested");
    }
  };

  const maybeContinueAsNew = async (worktree?: { path: string; branch: string }, agentOutput?: object) => {
    // V2 requires a stage checkpoint before history rollover; never restart it from
    // the beginning and duplicate completed agent/tool side effects.
    if (input.protocolVersion === 2) return;
    if (
      state.nodeAttempts.length - attemptsAtGenerationStart
      < MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW
    ) return;
    await continueAsNew<typeof factoryWorkflow>({
      ...input,
      continuation: {
        nodeAttempts: state.nodeAttempts,
        budget: state.budget,
        continuationGeneration: state.continuationGeneration + 1,
        worktree,
        agentOutput,
        baselineRevision,
      },
    });
  };

  const recordAttempts = (attempts: readonly { node: FactoryNodeName; attemptId: string; status: "succeeded" | "failed" | "cancelled" }[]) => {
    for (const attempt of attempts) {
      state.nodeAttempts = recordAttempt(state.nodeAttempts, attempt);
    }
  };

  const failRun = async (failedNode: FactoryNodeName, worktreePath?: string): Promise<FactoryWorkflowState> => {
    state.status = "failed";
    state.failedNode = failedNode;
    if (worktreePath) await controlActivity.removeWorktree(worktreePath);
    await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "failed", runId: input.runId });
    throw ApplicationFailure.nonRetryable(`factory failed at ${failedNode}`, "Failed", { failedNode });
  };

    let activeWorktreePath = continuation?.worktree?.path;
    let baselineRevision = continuation?.baselineRevision ?? "HEAD";

    try {
      let worktree = continuation?.worktree;
      let previous: object = continuation?.agentOutput ?? {};
      const predecessors: AgentOutput[] = continuation?.agentOutput
        && "predecessors" in continuation.agentOutput
        && Array.isArray(continuation.agentOutput.predecessors)
        ? continuation.agentOutput.predecessors.filter(isAgentOutput)
        : [];

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
        baselineRevision = preparation.revision;
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
    if (securityAttempt.failed) return await failRun("security_scan", worktree.path);
    checkCancelled();
    await maybeContinueAsNew(worktree, previous);

    const agentRoles = input.protocolVersion === 2
      ? (["discovery_plan", "implement"] as const)
      : (["scout", "plan", "implement"] as const);
    for (const role of agentRoles) {
      if (pendingRerun && pendingRerun !== role) continue;
      if (pendingRerun === role) pendingRerun = undefined;

      state.currentNode = role;
      let clarification:
        | { request: ClarificationRequest; answer: ClarificationAnswer }
        | undefined;
      let output: AgentOutput | undefined;
      for (let clarificationRound = 0; clarificationRound <= 2; clarificationRound += 1) {
        const agentInput = input.protocolVersion === 2
          ? {
            schemaVersion: "node-context.v1",
            stateRevision: predecessors.length,
            task: {
              prompt: input.description ?? input.title ?? input.taskId,
              ...(input.title ? { title: input.title } : {}),
              ...(input.description ? { description: input.description } : {}),
              repository: input.repository,
              baseBranch: input.baseBranch,
            },
            repository: { revision: baselineRevision, worktreePath: worktree!.path },
            predecessors: [...predecessors],
            conversationRefs: [],
            claimRefs: [],
            ...(clarification ? { clarification } : {}),
          }
          : previous;
        const agentRun = await runNodeWithRetry({
          runId: input.runId,
          node: role,
          budget: state.budget,
          maxAttempts: 2,
          execute: async (_attemptNumber, attemptId) => {
            const result = await agentActivity.runAgent({
              run: { ...input, attemptId },
              worktree: worktree!,
              role,
              input: agentInput,
            });
            if (result.output.status === "failed" || (input.protocolVersion !== 2 && !agentSucceeded(result.output))) {
              const failedOutput = result.output;
              const error = new Error(`${role} agent ${failedOutput.status}: ${failedOutput.summary}`);
              error.name = agentFailureName(failedOutput.status as "failed" | "escalate_to_human");
              throw error;
            }
            return result;
          },
          tokensUsed: () => 0,
        });
        state.budget = agentRun.budget;
        recordAttempts(agentRun.attemptRefs);
        if (agentRun.failed) return await failRun(role, worktree.path);
        output = (agentRun.output as AgentActivityResult).output;
        if (output.status === "succeeded") break;
        if (clarificationRound === 2) return await failRun(role, worktree.path);

        const createdAt = new Date().toISOString();
        const request: ClarificationRequest = {
          schemaVersion: "clarification-request.v1",
          requestId: uuid4(),
          runId: input.runId,
          threadId: `${input.runId}:${role}`,
          requestingNode: role,
          recipient: clarificationRecipient(output, role),
          question: String(output.data.question ?? output.summary),
          stateRevision: predecessors.length,
          repositoryRevision: baselineRevision,
          contextRefs: [...output.evidenceRefs],
          createdAt,
          deadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        };
        state.pendingClarification = request;
        predecessors.push(output);
        await controlActivity.recordFactoryEvent({
          runId: input.runId,
          eventId: `clarification-requested:${request.requestId}`,
          type: "clarification.requested",
          payload: request,
        });

        if (request.recipient.type === "node" && request.recipient.id !== role) {
          const peerRole = request.recipient.id === "implement" ? "implement" : "discovery_plan";
          const peerRun = await runNodeWithRetry({
            runId: input.runId,
            node: peerRole,
            budget: state.budget,
            maxAttempts: 1,
            execute: async (_attemptNumber, attemptId) => {
              const result = await agentActivity.runAgent({
                run: { ...input, attemptId },
                worktree: worktree!,
                role: peerRole,
                input: {
                  schemaVersion: "node-context.v1",
                  stateRevision: predecessors.length,
                  task: { prompt: request.question, repository: input.repository },
                  repository: { revision: baselineRevision, worktreePath: worktree!.path },
                  predecessors: [...predecessors],
                  conversationRefs: [],
                  claimRefs: [],
                  clarificationRequest: request,
                },
              });
              if (!agentSucceeded(result.output)) throw new Error(`${peerRole} could not answer clarification`);
              return result;
            },
          });
          state.budget = peerRun.budget;
          recordAttempts(peerRun.attemptRefs);
          if (peerRun.failed) return await failRun(peerRole, worktree.path);
          const peerOutput = (peerRun.output as AgentActivityResult).output;
          predecessors.push(peerOutput);
          pendingAnswer = {
            schemaVersion: "clarification-answer.v1",
            requestId: request.requestId,
            answerId: uuid4(),
            idempotencyKey: `${request.requestId}:${peerOutput.role}:${clarificationRound}`,
            responder: { type: "node", id: peerOutput.role },
            body: JSON.stringify({ summary: peerOutput.summary, data: peerOutput.data }),
            artifactRefs: [...peerOutput.evidenceRefs],
            stateRevision: request.stateRevision,
            createdAt: new Date().toISOString(),
          };
        } else {
          state.status = "input_required";
          await controlActivity.updateTaskStatus({
            taskId: input.taskId,
            status: "input_required",
            runId: input.runId,
            currentNode: role,
          });
          const answered = await condition(() => pendingAnswer !== undefined || cancelled, "24 hours");
          checkCancelled();
          if (!answered || !pendingAnswer) return await failRun(role, worktree.path);
        }

        clarification = { request, answer: pendingAnswer! };
        await controlActivity.recordFactoryEvent({
          runId: input.runId,
          eventId: `clarification-answered:${pendingAnswer!.answerId}`,
          type: "clarification.answered",
          payload: pendingAnswer!,
        });
        pendingAnswer = undefined;
        state.pendingClarification = undefined;
        state.status = "running";
        await controlActivity.updateTaskStatus({
          taskId: input.taskId,
          status: "running",
          runId: input.runId,
          currentNode: role,
        });
      }
      if (!output || output.status !== "succeeded") return await failRun(role, worktree.path);
      if (input.protocolVersion === 2) predecessors.push(output);
      previous = input.protocolVersion === 2
        ? { predecessors: [...predecessors] }
        : output.data;
      checkCancelled();
      await maybeContinueAsNew(worktree, previous);
    }

    state.currentNode = "deterministic_checks";
    const repairLoop = await runRepairLoop({
      runId: input.runId,
      budget: state.budget,
      maxRepairAttempts: state.budget.maxRepairAttempts,
      runChecks: () => buildActivity.runChecks({ run: input, worktree: worktree! }),
      runRepair: async (_repairAttempt, attemptId) => {
        const repair = await agentActivity.runAgent({ run: { ...input, attemptId }, worktree: worktree!, role: "repair", input: { previous } });
        if (!agentSucceeded(repair.output)) {
          const failedOutput = repair.output;
          const error = new Error(`repair agent ${failedOutput.status}: ${failedOutput.summary}`);
          error.name = agentFailureName(failedOutput.status as "failed" | "escalate_to_human");
          throw error;
        }
        return repair.output;
      },
    });
    state.budget = repairLoop.budget;
    recordAttempts(repairLoop.checksAttempts);
    recordAttempts(repairLoop.repairAttempts);
    if (!repairLoop.passed) return await failRun("deterministic_checks", worktree.path);
    if (repairLoop.repairOutput) previous = repairLoop.repairOutput.data;
    checkCancelled();
    await maybeContinueAsNew(worktree, previous);

    state.currentNode = "maintainability_assess";
    const maintainabilityLoop = await runMaintainabilityLoop({
      runId: input.runId,
      budget: state.budget,
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      assess: async (evidenceCollectionRounds, attemptId) => {
        const fitnessResult = await buildActivity.runFitnessAssessment({ run: input, worktree: worktree! });
        const fitness: FitnessRunResult = {
          outcome: fitnessResult.outcome,
          policyVersion: fitnessResult.policyVersion,
          shadowMode: fitnessResult.shadowMode,
          findings: fitnessResult.findings,
          rawSubScores: fitnessResult.rawSubScores,
          missingCapabilities: fitnessResult.missingCapabilities,
        };
        const criticEvidence = stripImplementerNarrative({
          workOrderId: input.taskId,
          acceptanceIds: [input.taskId],
          blueprintRefs: [`blueprint://${input.workflow}`],
          fitnessFindingRefs: fitness.findings.flatMap((finding) => finding.evidenceRefs),
          diffRefs: [`diff://${input.runId}`],
          graphRefs: [`graph://${input.runId}`],
          behavioralEvidenceRefs: [`scenario://${input.runId}`],
        });
        const requiredCritics = 1;
        const criticReports: unknown[] = [];
        if (requiredCritics > 0) {
          const critic = await agentActivity.runAgent({
            run: { ...input, attemptId },
            worktree: worktree!,
            role: "maintainability_critic",
            input: { evidence: criticEvidence, previous },
          });
          if (!agentSucceeded(critic.output)) {
            const failedOutput = critic.output;
            const error = new Error(`maintainability critic ${failedOutput.status}: ${failedOutput.summary}`);
            error.name = agentFailureName(failedOutput.status as "failed" | "escalate_to_human");
            throw error;
          }
          criticReports.push(critic.output.data.report);
        }
        const criticAssessment = assessCriticReports({
          requiredCritics,
          evidence: criticEvidence,
          reports: criticReports,
        });
        return assessMaintainability({
          policy: DEFAULT_MAINTAINABILITY_POLICY,
          fitness,
          critic: criticAssessment,
          evidenceCollectionRounds,
        });
      },
      runBehaviorChecks: () => buildActivity.runChecks({ run: input, worktree: worktree! }),
      runRefactor: async (scope, attempt, attemptId) => {
        const repair = await agentActivity.runAgent({
          run: { ...input, attemptId },
          worktree: worktree!,
          role: "repair",
          input: { mode: "maintainability_refactor", scope, attempt, previous },
        });
        if (!agentSucceeded(repair.output)) {
          const failedOutput = repair.output;
          const error = new Error(`maintainability repair ${failedOutput.status}: ${failedOutput.summary}`);
          error.name = agentFailureName(failedOutput.status as "failed" | "escalate_to_human");
          throw error;
        }
        return repair.output;
      },
    });
    state.budget = maintainabilityLoop.budget;
    recordAttempts(maintainabilityLoop.assessAttempts);
    recordAttempts(maintainabilityLoop.refactorAttempts);
    recordAttempts(maintainabilityLoop.behaviorAttempts);
    if (maintainabilityLoop.failed) return await failRun("maintainability_assess", worktree.path);
    checkCancelled();
    await maybeContinueAsNew(worktree, previous);

    state.currentNode = "behavioral_verify";
    const behavioralAttempt = await runNodeAttempt({
      runId: input.runId,
      node: "behavioral_verify",
      attemptNumber: 1,
      budget: state.budget,
      execute: async () => {
        const verification = await verifierActivity.runBehavioralVerification({
          run: input,
          worktree: worktree!,
          baselineRevision,
        });
        if (verification.decision === "fail") {
          const error = new Error(`behavioral verification failed: ${verification.decision}`);
          error.name = "PolicyViolation";
          throw error;
        }
        if (!verification.passed) {
          const error = new Error(`behavioral verification failed: ${verification.decision}`);
          error.name = "PolicyViolation";
          throw error;
        }
        return verification;
      },
    });
    state.budget = behavioralAttempt.budget;
    state.nodeAttempts = recordAttempt(state.nodeAttempts, behavioralAttempt.attemptRef);
    if (behavioralAttempt.result.status === "failed") {
      return await failRun("behavioral_verify", worktree.path);
    }
    checkCancelled();
    await maybeContinueAsNew(worktree, previous);

    state.currentNode = "review";
    const reviewRun = await runNodeWithRetry({
      runId: input.runId,
      node: "review",
      budget: state.budget,
      maxAttempts: 2,
      execute: async (_attemptNumber, attemptId) => {
        const review = await agentActivity.runAgent({ run: { ...input, attemptId }, worktree: worktree!, role: "review", input: previous });
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

    state.currentNode = "release_controller";
    const releaseAttempt = await runNodeAttempt({
      runId: input.runId,
      node: "release_controller",
      attemptNumber: 1,
      budget: state.budget,
      execute: async () => releaseWorkflow({ run: input, artifact }),
    });
    state.budget = releaseAttempt.budget;
    state.nodeAttempts = recordAttempt(state.nodeAttempts, releaseAttempt.attemptRef);
    if (releaseAttempt.result.status === "failed") return await failRun("release_controller", worktree.path);
    const release = releaseAttempt.result.output!;
    if (release.status === "failed") return await failRun("release_controller", worktree.path);
    if (release.status === "rolled_back") {
      state.status = "rolled_back";
      state.failedNode = "release_controller";
      if (worktree.path) await controlActivity.removeWorktree(worktree.path);
      await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "rolled_back", runId: input.runId });
      return buildFinalState(state);
    }
    if (release.status !== "promoted") return await failRun("release_controller", worktree.path);
    checkCancelled();
    await controlActivity.removeWorktree(worktree.path);
    await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "succeeded", runId: input.runId });
    state.status = "succeeded";
    state.currentNode = undefined;
    return buildFinalState(state);
  } catch (error) {
    if (state.status === "cancelled") {
      if (activeWorktreePath) await controlActivity.removeWorktree(activeWorktreePath);
      await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "cancelled", runId: input.runId });
      throw ApplicationFailure.nonRetryable("factory cancelled", "Cancelled");
    }
    if (state.status === "rolled_back") {
      if (activeWorktreePath) await controlActivity.removeWorktree(activeWorktreePath);
      await controlActivity.updateTaskStatus({ taskId: input.taskId, status: "rolled_back", runId: input.runId });
      throw ApplicationFailure.nonRetryable("release rollback requested", "RollbackRequested");
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
  pendingClarification?: ClarificationRequest;
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
    pendingClarification: state.pendingClarification,
    budget: toBudgetState(state.budget),
    continuationGeneration: state.continuationGeneration,
  };
}

function isAgentOutput(value: unknown): value is AgentOutput {
  return typeof value === "object"
    && value !== null
    && (value as AgentOutput).schemaVersion === "agent-output.v1"
    && typeof (value as AgentOutput).role === "string";
}

function clarificationRecipient(
  output: AgentOutput,
  requestingRole: string,
): ClarificationRequest["recipient"] {
  const recipientNode = output.data.recipientNode;
  if (
    typeof recipientNode === "string"
    && recipientNode !== requestingRole
    && (recipientNode === "discovery_plan" || recipientNode === "implement")
  ) {
    return { type: "node", id: recipientNode };
  }
  return { type: "requester", id: "origin" };
}

export { FACTORY_NODE_NAMES };
