import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationFailure } from "@temporalio/common";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { describe, expect, it } from "vitest";
import type { AgentOutput } from "../../src/contracts/nodes.js";
import type { FactoryWorkflowInput } from "../../src/temporal/client.js";
import {
  answerClarificationSignal,
  cancelFactorySignal,
  factoryStatusQuery,
  factoryWorkflow,
  rerunNodeSignal,
} from "../../src/temporal/workflows/factory-workflow.js";
import { DEFAULT_WORKFLOW_BUDGET } from "../../src/policy/retry-policy.js";
import {
  FACTORY_NODE_NAMES,
  type FactoryWorkflowContinuationInput,
} from "../../src/temporal/workflows/types.js";
import { TASK_QUEUES } from "../../src/temporal/task-queues.js";
import { registerFactorySearchAttributesWithConnection } from "../../src/temporal/search-attributes.js";

const workflowsPath = join(fileURLToPath(new URL(".", import.meta.url)), "../../src/temporal/workflows");
const temporalTimeoutMs = 60_000;

const baseInput: FactoryWorkflowInput = {
  runId: "run-test",
  taskId: "task-test",
  repository: "/repo/app",
  baseBranch: "main",
  workflow: "feature",
  deploymentProfile: "staging",
  sandboxProfile: "crabbox",
};

function agentOutput(role: string, status: AgentOutput["status"] = "succeeded"): AgentOutput {
  return {
    schemaVersion: "agent-output.v1",
    role: role as AgentOutput["role"],
    status,
    summary: `${role} ${status}`,
    evidenceRefs: ["ev-1"],
    data: { role },
  };
}

type MockOptions = {
  securityPassed?: boolean;
  checks?: Array<{ passed: boolean; output: string }>;
  reviewStatus?: AgentOutput["status"];
  transientScout?: boolean;
  exhaustedBudget?: boolean;
  maintainabilityRepairable?: boolean;
  internalClarification?: boolean;
  humanClarification?: boolean;
};

type AgentInvocation = {
  role: string;
  input: unknown;
};

function createReleaseActivities(calls: string[], previousDigest: string) {
  const digest = `registry/app@sha256:${"a".repeat(64)}`;
  return {
    deployPreview: async () => {
      calls.push("preview_deploy");
      return { previewUrl: "http://preview/health", healthUrl: "http://app/health", previousDigest };
    },
    verifyRelease: async () => {
      calls.push("release_verify");
      return { passed: true, reasons: [] };
    },
    deployCanary: async () => {
      calls.push("canary_deploy");
      return { deployed: true, percentage: 100, stageIndex: 0 };
    },
    observeDeployment: async () => {
      calls.push("observe");
      return {
        technical: { healthOk: true, errorRate: 0.001, latencyP99Ms: 100 },
        semantic: { productChecksPassed: true, sloBreaches: [] },
      };
    },
    rollbackDeployment: async () => {
      calls.push("rollback");
      return {
        rolledBack: true,
        digest: previousDigest,
        idempotent: false,
        fence: { deploymentId: "dep", fencedAt: "2026-08-06T00:00:00.000Z" },
      };
    },
    getDeploymentTarget: async () => ({
      host: "staging",
      healthUrl: "http://app/health",
      previewUrl: "http://preview/health",
      previousDigest,
    }),
    deploy: async () => {
      calls.push("deploy");
      return { deployed: true, healthUrl: "http://app/health" };
    },
    healthCheck: async () => {
      calls.push("health_check");
      return { healthy: true, url: "http://app/health" };
    },
    digest,
  };
}

function createActivities(options: MockOptions = {}) {
  const calls: string[] = [];
  const agentInvocations: AgentInvocation[] = [];
  let criticCalls = 0;
  let implementCalls = 0;
  const checks = [...(options.checks ?? [{ passed: true, output: "ok" }])];
  const release = createReleaseActivities(calls, `registry/app@sha256:${"b".repeat(64)}`);

  const activities = {
    prepareRepository: async () => {
      calls.push("prepare_repository");
      return { repository: "/repo/app", revision: "abc" };
    },
    createWorktree: async () => {
      calls.push("create_worktree");
      return { path: "/worktrees/run-test", branch: "factory/run-test" };
    },
    removeWorktree: async (path: string) => {
      calls.push(`cleanup:${path}`);
    },
    securityScan: async () => {
      calls.push("security_scan");
      return {
        passed: options.securityPassed ?? true,
        findings: options.securityPassed === false ? [".env"] : [],
      };
    },
    runAgent: async ({ role, input, run }: { role: string; input?: unknown; run: { attemptId?: string } }) => {
      calls.push(`agent:${role}`);
      agentInvocations.push({ role, input });
      if (options.exhaustedBudget) {
        return { sessionId: role, output: agentOutput(role, "failed") };
      }
      if (role === "maintainability_critic") {
        criticCalls += 1;
        const blockingFinding = {
          id: "finding-1",
          category: "forbidden_direction",
          severity: "block",
          confidence: 0.9,
          dimension: "modularity",
          affectedSymbols: ["src/billing/invoice.ts::InvoiceService"],
          evidenceRefs: ["ev-1"],
          violatedInvariant: "billing boundary",
          minimumRepair: "use BillingPort",
          falsificationCondition: "imports only allowed ports",
          explanation: "forbidden import",
        };
        return {
          sessionId: role,
          output: {
            ...agentOutput(role),
            data: {
              report: {
                schemaVersion: "critic-report.v1",
                criticId: "critic-test",
                findings: options.maintainabilityRepairable && criticCalls === 1 ? [blockingFinding] : [],
              },
            },
          },
        };
      }
      if (options.transientScout && role === "scout") {
        const attemptNumber = run.attemptId?.match(/^scout-(\d+)-/)?.[1];
        if (attemptNumber === "1") {
          throw ApplicationFailure.nonRetryable("transient timeout", "TRANSIENT");
        }
      }
      if (role === "review" && options.reviewStatus) {
        return { sessionId: role, output: agentOutput(role, options.reviewStatus) };
      }
      if (role === "implement" && (options.internalClarification || options.humanClarification)) {
        implementCalls += 1;
        if (implementCalls === 1) {
          return {
            sessionId: role,
            output: {
              ...agentOutput(role, "escalate_to_human"),
              data: {
                question: "Which compatibility rule applies?",
                ...(options.internalClarification ? { recipientNode: "discovery_plan" } : {}),
              },
            },
          };
        }
      }
      return { sessionId: role, output: agentOutput(role) };
    },
    runChecks: async () => {
      calls.push("deterministic_checks");
      return checks.shift() ?? { passed: true, output: "ok" };
    },
    runFitnessAssessment: async () => {
      calls.push("maintainability_assess");
      return {
        outcome: "pass",
        policyVersion: "test",
        shadowMode: true,
        findings: [],
        rawSubScores: [],
        missingCapabilities: [],
      };
    },
    runBehavioralVerification: async () => {
      calls.push("behavioral_verify");
      return {
        passed: true,
        decision: "pass" as const,
        suite: {
          schemaVersion: "scenario-suite.v1" as const,
          decision: "pass" as const,
          policyVersion: "scenario-verifier.v1",
          runs: [],
          distributions: [],
          evidenceRefs: ["ev-scn-1"],
        },
        evidenceRefs: ["ev-scn-1"],
      };
    },
    buildArtifact: async () => {
      calls.push("build_artifact");
      return { image: "registry/app", digest: release.digest };
    },
    ...release,
    updateTaskStatus: async ({ status }: { status: string }) => {
      calls.push(`status:${status}`);
    },
    recordFactoryEvent: async ({ type }: { type: string }) => {
      calls.push(`event:${type}`);
    },
  };

  return { activities, calls, agentInvocations };
}

function queueScopedActivities(fullActivities: ReturnType<typeof createActivities>["activities"]) {
  return {
    [TASK_QUEUES.control]: {
      prepareRepository: fullActivities.prepareRepository,
      createWorktree: fullActivities.createWorktree,
      removeWorktree: fullActivities.removeWorktree,
      securityScan: fullActivities.securityScan,
      updateTaskStatus: fullActivities.updateTaskStatus,
      recordFactoryEvent: fullActivities.recordFactoryEvent,
    },
    [TASK_QUEUES.agent]: {
      runAgent: fullActivities.runAgent,
    },
    [TASK_QUEUES.build]: {
      runChecks: fullActivities.runChecks,
      runFitnessAssessment: fullActivities.runFitnessAssessment,
      buildArtifact: fullActivities.buildArtifact,
    },
    [TASK_QUEUES.verifier]: {
      runBehavioralVerification: fullActivities.runBehavioralVerification,
    },
    [TASK_QUEUES.deploy]: {
      deployPreview: fullActivities.deployPreview,
      verifyRelease: fullActivities.verifyRelease,
      deployCanary: fullActivities.deployCanary,
      observeDeployment: fullActivities.observeDeployment,
      rollbackDeployment: fullActivities.rollbackDeployment,
      getDeploymentTarget: fullActivities.getDeploymentTarget,
      deploy: fullActivities.deploy,
      healthCheck: fullActivities.healthCheck,
    },
  };
}

async function runFactoryTest(
  options: MockOptions = {},
  runOptions?: {
    signal?: "cancel" | "rerun" | "answer";
    continuation?: FactoryWorkflowContinuationInput["continuation"];
    queueScoped?: boolean;
    protocolVersion?: 2;
  },
) {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  await registerFactorySearchAttributesWithConnection(testEnv.connection, testEnv.namespace);
  const { activities, calls, agentInvocations } = createActivities(options);
  const scoped = queueScopedActivities(activities);
  const workers = await Promise.all(Object.values(TASK_QUEUES).map((taskQueue) =>
    Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: runOptions?.queueScoped ? scoped[taskQueue as keyof typeof scoped] : activities,
    }),
  ));
  const workerRuns = workers.map((worker) => worker.run());

  try {
    const workflowInput: FactoryWorkflowContinuationInput = runOptions?.continuation
      ? { ...baseInput, continuation: runOptions.continuation }
      : { ...baseInput, protocolVersion: runOptions?.protocolVersion };
    const handle = await testEnv.client.workflow.start(factoryWorkflow, {
      taskQueue: TASK_QUEUES.control,
      workflowId: `factory-${baseInput.runId}-${Math.random().toString(36).slice(2)}`,
      args: [workflowInput],
    });
    if (runOptions?.signal === "cancel") {
      await handle.signal(cancelFactorySignal);
    }
    if (runOptions?.signal === "rerun") {
      await handle.signal(rerunNodeSignal, "scout");
    }
    if (runOptions?.signal === "answer") {
      let status = await handle.query(factoryStatusQuery);
      while (status.status !== "input_required" || !status.pendingClarification) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        status = await handle.query(factoryStatusQuery);
      }
      await handle.signal(answerClarificationSignal, {
        schemaVersion: "clarification-answer.v1",
        requestId: status.pendingClarification.requestId,
        answerId: "answer-1",
        idempotencyKey: "answer-1",
        responder: { type: "human", id: "test" },
        body: "Maintain compatibility.",
        stateRevision: status.pendingClarification.stateRevision,
        createdAt: "2026-08-07T12:00:00.000Z",
      });
    }
    const result = await handle.result();
    return { result, calls, agentInvocations, threw: false as const };
  } catch (error) {
    return { error, calls, agentInvocations, threw: true as const };
  } finally {
    await Promise.all(workers.map((worker) => worker.shutdown()));
    await Promise.allSettled(workerRuns);
    await testEnv.teardown();
  }
}

describe("factory workflow topology", () => {
  it("keeps the graph topology explicit and stable", () => {
    expect(FACTORY_NODE_NAMES).toEqual([
      "prepare_repository",
      "create_worktree",
      "security_scan",
      "scout",
      "plan",
      "implement",
      "deterministic_checks",
      "repair",
      "maintainability_assess",
      "behavioral_verify",
      "review",
      "build_artifact",
      "release_controller",
    ]);
  });
});

describe.sequential("factory workflow policy execution", () => {
  it("succeeds with durable node attempt history", async () => {
    const { result, threw } = await runFactoryTest();
    expect(threw).toBe(false);
    expect(result!.status).toBe("succeeded");
    expect(result!.nodeAttempts.length).toBeGreaterThan(0);
    expect(result!.completedNodes).toContain("scout");
    expect(result!.budget?.agentAttemptsUsed).toBeGreaterThan(0);
  }, temporalTimeoutMs);

  it("uses one discovery-plan node and preserves its complete output for implementation in v2", async () => {
    const { result, agentInvocations, threw } = await runFactoryTest({}, { protocolVersion: 2 });
    expect(threw).toBe(false);
    expect(result!.completedNodes).toContain("discovery_plan");
    expect(agentInvocations.slice(0, 2).map(({ role }) => role)).toEqual([
      "discovery_plan",
      "implement",
    ]);
    expect(agentInvocations.map(({ role }) => role)).not.toContain("scout");
    expect(agentInvocations.map(({ role }) => role)).not.toContain("plan");
    expect(agentInvocations[1]?.input).toMatchObject({
      schemaVersion: "node-context.v1",
      predecessors: [{
        schemaVersion: "agent-output.v1",
        role: "discovery_plan",
        summary: "discovery_plan succeeded",
        evidenceRefs: ["ev-1"],
        data: { role: "discovery_plan" },
      }],
    });
  }, temporalTimeoutMs);

  it("routes a downstream clarification back to discovery-plan and resumes implementation", async () => {
    const { agentInvocations, threw } = await runFactoryTest(
      { internalClarification: true },
      { protocolVersion: 2 },
    );
    expect(threw).toBe(false);
    expect(agentInvocations.slice(0, 4).map(({ role }) => role)).toEqual([
      "discovery_plan",
      "implement",
      "discovery_plan",
      "implement",
    ]);
    expect(agentInvocations[3]?.input).toMatchObject({
      clarification: {
        request: {
          requestingNode: "implement",
          recipient: { type: "node", id: "discovery_plan" },
        },
        answer: {
          responder: { type: "node", id: "discovery_plan" },
        },
      },
    });
  }, temporalTimeoutMs);

  it("waits durably for a requester answer and resumes the same node", async () => {
    const { calls, agentInvocations, threw } = await runFactoryTest(
      { humanClarification: true },
      { protocolVersion: 2, signal: "answer" },
    );
    expect(threw).toBe(false);
    expect(calls).toContain("status:input_required");
    expect(calls).toContain("event:clarification.requested");
    expect(calls).toContain("event:clarification.answered");
    expect(agentInvocations.filter(({ role }) => role === "implement")).toHaveLength(2);
  }, temporalTimeoutMs);

  it("does not fall through to build when review gate fails", async () => {
    const { calls, threw } = await runFactoryTest({ reviewStatus: "failed" });
    expect(threw).toBe(true);
    expect(calls).not.toContain("build_artifact");
  }, temporalTimeoutMs);

  it("records distinct scout attempts on transient retry", async () => {
    const { result, threw } = await runFactoryTest({ transientScout: true });
    expect(threw).toBe(false);
    const scoutAttempts = result!.nodeAttempts.filter((attempt) => attempt.node === "scout");
    expect(scoutAttempts.length).toBeGreaterThanOrEqual(2);
    expect(scoutAttempts[0].attemptId).not.toBe(scoutAttempts[1]?.attemptId);
  }, temporalTimeoutMs);

  it("runs bounded repair and re-check attempts", async () => {
    const { result, calls, threw } = await runFactoryTest({
      checks: [
        { passed: false, output: "fail" },
        { passed: true, output: "ok" },
      ],
    });
    expect(threw).toBe(false);
    expect(result!.status).toBe("succeeded");
    expect(calls.filter((call) => call === "deterministic_checks").length).toBeGreaterThanOrEqual(2);
    expect(calls).toContain("agent:repair");
    expect(result!.nodeAttempts.some((attempt) => attempt.node === "repair")).toBe(true);
  }, temporalTimeoutMs);

  it("returns failed when budget is exhausted", async () => {
    const { result, threw } = await runFactoryTest({ exhaustedBudget: true });
    expect(threw).toBe(true);
    expect(result).toBeUndefined();
  }, temporalTimeoutMs);

  it("fails security violations without running agents", async () => {
    const { calls, threw } = await runFactoryTest({ securityPassed: false });
    expect(threw).toBe(true);
    expect(calls).not.toContain("agent:scout");
    expect(calls).toContain("security_scan");
  }, temporalTimeoutMs);

  it("cleans up worktree on failure", async () => {
    const { calls, threw } = await runFactoryTest({ exhaustedBudget: true });
    expect(threw).toBe(true);
    expect(calls.some((call) => call.startsWith("cleanup:"))).toBe(true);
  }, temporalTimeoutMs);

  it("handles cancellation with cancelled status", async () => {
    const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  await registerFactorySearchAttributesWithConnection(testEnv.connection, testEnv.namespace);
    const { activities, calls } = createActivities();
    const workers = await Promise.all(Object.values(TASK_QUEUES).map((taskQueue) =>
      Worker.create({
        connection: testEnv.nativeConnection,
        taskQueue,
        workflowsPath,
        activities,
      }),
    ));
    const workerRuns = workers.map((worker) => worker.run());
    try {
      const handle = await testEnv.client.workflow.start(factoryWorkflow, {
        taskQueue: TASK_QUEUES.control,
        workflowId: `factory-cancel-${Date.now()}`,
        args: [baseInput],
      });
      await handle.signal(cancelFactorySignal);
      await expect(handle.result()).rejects.toThrow();
      const status = await handle.query(factoryStatusQuery);
      expect(status.status).toBe("cancelled");
    } finally {
      await Promise.all(workers.map((worker) => worker.shutdown()));
      await Promise.allSettled(workerRuns);
      await testEnv.teardown();
    }
  }, temporalTimeoutMs);

  it("accepts rerun node signal for named node transitions", async () => {
    const { result, threw } = await runFactoryTest({}, { signal: "rerun" });
    expect(threw).toBe(false);
    expect(result!.status).toBe("succeeded");
    expect(result!.nodeAttempts.filter((attempt) => attempt.node === "scout").length).toBeGreaterThan(0);
  }, temporalTimeoutMs);

  it("executes stages in the explicit production order", async () => {
    const { calls, threw } = await runFactoryTest();
    expect(threw).toBe(false);
    const stageMarkers = [
      "prepare_repository",
      "create_worktree",
      "security_scan",
      "agent:scout",
      "agent:plan",
      "agent:implement",
      "deterministic_checks",
      "maintainability_assess",
      "agent:maintainability_critic",
      "behavioral_verify",
      "agent:review",
      "build_artifact",
      "preview_deploy",
      "status:succeeded",
    ];
    let previousIndex = -1;
    for (const marker of stageMarkers) {
      const index = calls.indexOf(marker);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  }, temporalTimeoutMs);

  it("uses the repair role for check repair without maintainability mode metadata", async () => {
    const { agentInvocations, threw } = await runFactoryTest({
      checks: [
        { passed: false, output: "fail" },
        { passed: true, output: "ok" },
      ],
    });
    expect(threw).toBe(false);
    const repairCalls = agentInvocations.filter((invocation) => invocation.role === "repair");
    expect(repairCalls).toHaveLength(1);
    expect(repairCalls[0].input).toEqual({ previous: expect.objectContaining({ role: "implement" }) });
    expect((repairCalls[0].input as { mode?: string }).mode).toBeUndefined();
  }, temporalTimeoutMs);

  it("uses the repair role with maintainability_refactor mode during maintainability loop", async () => {
    const { agentInvocations, threw } = await runFactoryTest({ maintainabilityRepairable: true });
    expect(threw).toBe(false);
    const maintainabilityRepairs = agentInvocations.filter(
      (invocation) => invocation.role === "repair"
        && (invocation.input as { mode?: string }).mode === "maintainability_refactor",
    );
    expect(maintainabilityRepairs).toHaveLength(1);
    expect(maintainabilityRepairs[0].input).toMatchObject({
      mode: "maintainability_refactor",
      attempt: 1,
      scope: expect.objectContaining({
        mode: "maintainability_refactor",
        findingIds: expect.any(Array),
      }),
    });
  }, temporalTimeoutMs);

  it("preserves continuation state and skips repository preparation", async () => {
    const continuation = {
      nodeAttempts: [
        { node: "prepare_repository" as const, attemptId: "prepare_repository-1", status: "succeeded" as const },
        { node: "create_worktree" as const, attemptId: "create_worktree-1", status: "succeeded" as const },
        { node: "security_scan" as const, attemptId: "security_scan-1", status: "succeeded" as const },
        { node: "scout" as const, attemptId: "scout-1", status: "succeeded" as const },
        { node: "plan" as const, attemptId: "plan-1", status: "succeeded" as const },
        { node: "implement" as const, attemptId: "implement-1", status: "succeeded" as const },
      ],
      budget: { ...DEFAULT_WORKFLOW_BUDGET, agentAttemptsUsed: 3, repairAttemptsUsed: 0 },
      continuationGeneration: 2,
      worktree: { path: "/worktrees/continued", branch: "factory/continued" },
      agentOutput: { role: "implement", summary: "done" },
    };
    const { result, calls, threw } = await runFactoryTest({}, { continuation });
    expect(threw).toBe(false);
    expect(calls).not.toContain("prepare_repository");
    expect(calls).not.toContain("create_worktree");
    expect(result!.continuationGeneration).toBe(2);
    expect(result!.budget?.agentAttemptsUsed).toBeGreaterThanOrEqual(3);
    expect(calls.some((call) => call.startsWith("cleanup:/worktrees/continued"))).toBe(true);
  }, temporalTimeoutMs);

  it("succeeds when activities are registered only on their workflow queues", async () => {
    const { result, threw } = await runFactoryTest({}, { queueScoped: true });
    expect(threw).toBe(false);
    expect(result!.status).toBe("succeeded");
  }, temporalTimeoutMs);
});
