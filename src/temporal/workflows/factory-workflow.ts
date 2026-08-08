import {
  ApplicationFailure,
  CancellationScope,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  isCancellation,
  proxyActivities,
  setHandler,
  upsertSearchAttributes,
  uuid4,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../activities/types.js";
import type { AgentActivityResult } from "../activities/types.js";
import type { AgentOutput } from "../../contracts/nodes.js";
import type { ClarificationAnswer, ClarificationRequest } from "../../contracts/clarification.js";
import type { FactoryNodeName } from "../../contracts/nodes.js";
import {
  appendExecutionRecord,
  createExecutionLedger,
  executionView,
  FACTORY_EXECUTION_GRAPH_V2,
  updateExecutionState,
  type FactoryExecutionViewV2,
  type ExecutionRecord,
} from "../../contracts/execution.js";
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
  heartbeatTimeout: "10 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "5 minutes",
    maximumAttempts: 1,
    nonRetryableErrorTypes: ["PolicyViolation", "SecurityRejected", "InvalidTask", "HumanEscalation"],
  },
};

const controlActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.control });
const agentActivity = proxyActivities<typeof activities>({
  ...activityOptions,
  startToCloseTimeout: "2 hours",
  taskQueue: TASK_QUEUES.agent,
  // Short enough to recover quickly if the worker dies; heartbeats every ~20s keep it alive.
  heartbeatTimeout: "5 minutes",
  retry: {
    ...activityOptions.retry,
    // Heartbeat/worker restarts are transient — allow a few attempts.
    maximumAttempts: 3,
  },
});
const buildActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.build });
const verifierActivity = proxyActivities<typeof activities>({ ...activityOptions, taskQueue: TASK_QUEUES.verifier });

export const cancelFactorySignal = defineSignal("cancelFactory");
export const rerunNodeSignal = defineSignal<[FactoryNodeName]>("rerunNode");
export const rollbackReleaseSignal = defineSignal("rollbackRelease");
export const answerClarificationSignal = defineSignal<[ClarificationAnswer]>("answerClarification");
export const factoryStatusQuery = defineQuery<FactoryWorkflowState>("factoryStatus");
export const factoryExecutionViewQuery = defineQuery<FactoryExecutionViewV2 | null>("factoryExecutionView");

function agentSucceeded(output: { status: "succeeded" | "failed" | "escalate_to_human" | "abstained"; summary: string }): boolean {
  return output.status === "succeeded";
}

function maintainabilityCriticCompleted(output: { status: "succeeded" | "failed" | "escalate_to_human" | "abstained"; summary: string }): boolean {
  return output.status === "succeeded" || output.status === "abstained";
}

function reviewGatePassed(output: AgentOutput, options?: { advisory?: boolean }): boolean {
  if (output.status === "succeeded") return output.data.approved !== false;
  if (output.status === "abstained") return true;
  // Local/dev completion path: keep review findings in the run record but do not block.
  if (options?.advisory && output.status === "failed") return true;
  return false;
}

function agentFailureName(status: "failed" | "escalate_to_human"): string {
  if (status === "escalate_to_human") return "HumanEscalation";
  return "PolicyViolation";
}

export async function factoryWorkflow(input: FactoryWorkflowContinuationInput): Promise<FactoryWorkflowState> {
  const workflow = workflowInfo();
  const usesExecutionContract = (input.protocolVersion ?? 1) >= 2;
  const executionStartedAt = new Date().toISOString();
  const continuation = input.continuation;
  const state: {
    schemaVersion: "factory-run.v1";
    runId: string;
    status: FactoryWorkflowState["status"];
    nodeAttempts: FactoryWorkflowState["nodeAttempts"];
    executionRecords: ExecutionRecord[];
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
    executionRecords: continuation?.executionRecords ? [...continuation.executionRecords] : [],
    continuationGeneration: continuation?.continuationGeneration ?? 0,
    budget: continuation?.budget ?? { ...DEFAULT_WORKFLOW_BUDGET },
  };
  const attemptsAtGenerationStart = state.nodeAttempts.length;

  const syncSearchAttributes = (overrides?: {
    currentNode?: FactoryNodeName | undefined;
    status?: FactoryWorkflowState["status"];
  }) => {
    const status = overrides?.status ?? state.status;
    const attrs: Record<string, string[]> = {
      FactoryRunStatus: [status],
    };
    if (overrides && "currentNode" in overrides) {
      if (overrides.currentNode !== undefined) {
        attrs.FactoryCurrentNode = [overrides.currentNode];
      } else {
        attrs.FactoryCurrentNode = [];
      }
    } else if (state.currentNode !== undefined) {
      attrs.FactoryCurrentNode = [state.currentNode];
    }
    upsertSearchAttributes(attrs);
  };

  const setStatus = (status: FactoryWorkflowState["status"]) => {
    if (state.status !== status) {
      const occurredAt = new Date().toISOString();
      state.executionRecords.push({
        schemaVersion: "execution-event.v2",
        recordId: `status:${status}:${state.executionRecords.length}`,
        type: `execution.${status}`,
        occurredAt,
        payload: { status },
      });
    }
    state.status = status;
    syncSearchAttributes({ status });
  };

  const setCurrentNode = (node: FactoryNodeName | undefined) => {
    state.currentNode = node;
    syncSearchAttributes({ currentNode: node });
  };

  let cancelled = false;
  let pendingRollback = false;
  let pendingRerun: FactoryNodeName | undefined;
  let pendingAnswer: ClarificationAnswer | undefined;
  setHandler(cancelFactorySignal, () => { cancelled = true; });
  setHandler(rollbackReleaseSignal, () => { pendingRollback = true; });
  setHandler(rerunNodeSignal, (node) => {
    if (FACTORY_EXECUTION_GRAPH_V2.nodes.some((definition) => definition.id === node)) {
      pendingRerun = node;
    }
  });
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
  setHandler(factoryExecutionViewQuery, (): FactoryExecutionViewV2 | null => {
    if (input.protocolVersion !== 3) return null;
    let ledger = createExecutionLedger({
      workflowId: workflow.workflowId,
      runId: input.runId,
      taskId: input.taskId,
      repository: input.repository,
      prompt: input.description ?? input.title ?? input.taskId,
      startedAt: executionStartedAt,
    });
    ledger = updateExecutionState(ledger, {
      status: state.status,
      currentNode: state.currentNode ?? null,
      failedNode: state.failedNode ?? null,
      updatedAt: state.nodeAttempts.at(-1)?.completedAt ?? executionStartedAt,
    });
    for (const attempt of state.nodeAttempts) {
      ledger = appendExecutionRecord(ledger, {
        schemaVersion: "node-attempt.v2",
        recordId: `attempt:${attempt.attemptId}`,
        nodeId: attempt.node,
        attemptId: attempt.attemptId,
        status: attempt.status,
        startedAt: attempt.startedAt ?? executionStartedAt,
        completedAt: attempt.completedAt,
        failureCode: attempt.failureCode,
        evidenceRefs: attempt.evidenceRefs ?? [],
      });
    }
    for (const record of state.executionRecords) {
      ledger = appendExecutionRecord(ledger, record);
    }
    return executionView(ledger);
  });

  const checkCancelled = () => {
    if (cancelled) {
      setStatus("cancelled");
      throw ApplicationFailure.nonRetryable("factory cancelled", "Cancelled");
    }
    if (pendingRollback) {
      setStatus("rolled_back");
      state.failedNode = state.currentNode;
      throw ApplicationFailure.nonRetryable("release rollback requested", "RollbackRequested");
    }
  };

  const maybeContinueAsNew = async (worktree?: { path: string; branch: string }, agentOutput?: object) => {
    // V2 requires a stage checkpoint before history rollover; never restart it from
    // the beginning and duplicate completed agent/tool side effects.
    if (usesExecutionContract) return;
    if (
      state.nodeAttempts.length - attemptsAtGenerationStart
      < MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW
    ) return;
    await continueAsNew<typeof factoryWorkflow>({
      ...input,
      continuation: {
        nodeAttempts: state.nodeAttempts,
        executionRecords: state.executionRecords,
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

  const captureAgentExecution = (result: AgentActivityResult) => {
    if (!result.execution) return;
    const next = [result.execution.turn, ...result.execution.toolCalls];
    for (const record of next) {
      const index = state.executionRecords.findIndex((current) => current.recordId === record.recordId);
      if (index >= 0) state.executionRecords[index] = record;
      else state.executionRecords.push(record);
    }
  };

  const failRun = async (failedNode: FactoryNodeName, worktreePath?: string): Promise<FactoryWorkflowState> => {
    setStatus("failed");
    state.failedNode = failedNode;
    if (worktreePath) await controlActivity.removeWorktree(worktreePath);
    throw ApplicationFailure.nonRetryable(`factory failed at ${failedNode}`, "Failed", { failedNode });
  };

  const cleanupCancelled = async () => {
    await CancellationScope.nonCancellable(async () => {
      if (state.status !== "cancelled") setStatus("cancelled");
      if (activeWorktreePath) await controlActivity.removeWorktree(activeWorktreePath);
    });
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
        setCurrentNode("prepare_repository");
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

      setCurrentNode("create_worktree");
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

    setCurrentNode("security_scan");
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

    const agentRoles = usesExecutionContract
      ? (["discovery_plan", "implement"] as const)
      : (["scout", "plan", "implement"] as const);
    for (const role of agentRoles) {
      if (pendingRerun && pendingRerun !== role) continue;
      if (pendingRerun === role) pendingRerun = undefined;

      setCurrentNode(role);
      let clarification:
        | { request: ClarificationRequest; answer: ClarificationAnswer }
        | undefined;
      let output: AgentOutput | undefined;
      for (let clarificationRound = 0; clarificationRound <= 2; clarificationRound += 1) {
        const agentInput = usesExecutionContract
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
            if (result.output.status === "failed" || (!usesExecutionContract && !agentSucceeded(result.output))) {
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
        const agentResult = agentRun.output as AgentActivityResult;
        captureAgentExecution(agentResult);
        output = agentResult.output;
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
        state.executionRecords.push({
          schemaVersion: "execution-event.v2",
          recordId: `clarification-requested:${request.requestId}`,
          type: "clarification.requested",
          occurredAt: request.createdAt,
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
          const peerResult = peerRun.output as AgentActivityResult;
          captureAgentExecution(peerResult);
          const peerOutput = peerResult.output;
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
          setStatus("input_required");
          const answered = await condition(() => pendingAnswer !== undefined || cancelled, "24 hours");
          checkCancelled();
          if (!answered || !pendingAnswer) return await failRun(role, worktree.path);
        }

        clarification = { request, answer: pendingAnswer! };
        state.executionRecords.push({
          schemaVersion: "execution-event.v2",
          recordId: `clarification-answered:${pendingAnswer!.answerId}`,
          type: "clarification.answered",
          occurredAt: pendingAnswer!.createdAt,
          payload: pendingAnswer!,
        });
        pendingAnswer = undefined;
        state.pendingClarification = undefined;
        setStatus("running");
      }
      if (!output || output.status !== "succeeded") return await failRun(role, worktree.path);
      if (usesExecutionContract) predecessors.push(output);
      previous = usesExecutionContract
        ? { predecessors: [...predecessors] }
        : output.data;
      checkCancelled();
      await maybeContinueAsNew(worktree, previous);
    }

    setCurrentNode("deterministic_checks");
    const repairLoop = await runRepairLoop({
      runId: input.runId,
      budget: state.budget,
      maxRepairAttempts: state.budget.maxRepairAttempts,
      runChecks: () => buildActivity.runChecks({ run: input, worktree: worktree! }),
      runRepair: async (_repairAttempt, attemptId) => {
        const repair = await agentActivity.runAgent({ run: { ...input, attemptId }, worktree: worktree!, role: "repair", input: { previous } });
        captureAgentExecution(repair);
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

    setCurrentNode("maintainability_assess");
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
        const requiredCritics = fitnessResult.policyVersion === "go-unsupported-skip" ? 0 : 1;
        const criticReports: unknown[] = [];
        if (requiredCritics > 0) {
          const critic = await agentActivity.runAgent({
            run: { ...input, attemptId },
            worktree: worktree!,
            role: "maintainability_critic",
            input: { evidence: criticEvidence, previous },
          });
          captureAgentExecution(critic);
          if (!maintainabilityCriticCompleted(critic.output)) {
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
        captureAgentExecution(repair);
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

    setCurrentNode("behavioral_verify");
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

    setCurrentNode("review");
    const reviewRun = await runNodeWithRetry({
      runId: input.runId,
      node: "review",
      budget: state.budget,
      maxAttempts: 2,
      execute: async (_attemptNumber, attemptId) => {
        const review = await agentActivity.runAgent({ run: { ...input, attemptId }, worktree: worktree!, role: "review", input: previous });
        captureAgentExecution(review);
        if (!reviewGatePassed(review.output, { advisory: Boolean(input.skipBuildRelease) })) {
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

    if (input.skipBuildRelease) {
      if (worktree.path) await controlActivity.removeWorktree(worktree.path);
      setStatus("succeeded");
      setCurrentNode(undefined);
      return buildFinalState(state);
    }

    setCurrentNode("build_artifact");
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

    setCurrentNode("release_controller");
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
      setStatus("rolled_back");
      state.failedNode = "release_controller";
      if (worktree.path) await controlActivity.removeWorktree(worktree.path);
      return buildFinalState(state);
    }
    if (release.status !== "promoted") return await failRun("release_controller", worktree.path);
    checkCancelled();
    await controlActivity.removeWorktree(worktree.path);
    setStatus("succeeded");
    setCurrentNode(undefined);
    return buildFinalState(state);
  } catch (error) {
    if (isCancellation(error) || state.status === "cancelled") {
      await cleanupCancelled();
      throw ApplicationFailure.nonRetryable("factory cancelled", "Cancelled");
    }
    if (state.status === "rolled_back") {
      await CancellationScope.nonCancellable(async () => {
        if (activeWorktreePath) await controlActivity.removeWorktree(activeWorktreePath);
      });
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
  executionRecords: ExecutionRecord[];
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
