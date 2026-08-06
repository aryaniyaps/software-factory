import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { describe, expect, it } from "vitest";
import type { AgentOutput } from "../../src/contracts/nodes.js";
import type { FactoryWorkflowInput } from "../../src/temporal/client.js";
import {
  cancelFactorySignal,
  factoryStatusQuery,
  factoryWorkflow,
  rerunNodeSignal,
} from "../../src/temporal/workflows/factory-workflow.js";
import { FACTORY_NODE_NAMES } from "../../src/temporal/workflows/types.js";
import { TASK_QUEUES } from "../../src/temporal/task-queues.js";

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
};

function createActivities(options: MockOptions = {}) {
  const calls: string[] = [];
  let scoutAttempts = 0;
  const checks = [...(options.checks ?? [{ passed: true, output: "ok" }])];

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
    runAgent: async ({ role }: { role: string }) => {
      calls.push(`agent:${role}`);
      if (options.exhaustedBudget) {
        return { sessionId: role, output: agentOutput(role, "abstained") };
      }
      if (options.transientScout && role === "scout") {
        scoutAttempts += 1;
        if (scoutAttempts === 1) throw new Error("transient timeout");
      }
      if (role === "review" && options.reviewStatus) {
        return { sessionId: role, output: agentOutput(role, options.reviewStatus) };
      }
      return { sessionId: role, output: agentOutput(role) };
    },
    runChecks: async () => {
      calls.push("deterministic_checks");
      return checks.shift() ?? { passed: true, output: "ok" };
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
      return { image: "app", digest: "sha256:abc" };
    },
    deploy: async () => {
      calls.push("deploy");
      return { deployed: true, healthUrl: "http://app/health" };
    },
    healthCheck: async () => {
      calls.push("health_check");
      return { healthy: true, url: "http://app/health" };
    },
    updateTaskStatus: async ({ status }: { status: string }) => {
      calls.push(`status:${status}`);
    },
  };

  return { activities, calls };
}

async function runFactoryTest(options: MockOptions = {}, runOptions?: { signal?: "cancel" | "rerun" }) {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const { activities, calls } = createActivities(options);
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
      workflowId: `factory-${baseInput.runId}-${Math.random().toString(36).slice(2)}`,
      args: [baseInput],
    });
    if (runOptions?.signal === "cancel") {
      await handle.signal(cancelFactorySignal);
    }
    if (runOptions?.signal === "rerun") {
      await handle.signal(rerunNodeSignal, "scout");
    }
    const result = await handle.result();
    return { result, calls, threw: false as const };
  } catch (error) {
    return { error, calls, threw: true as const };
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
      "behavioral_verify",
      "review",
      "build_artifact",
      "deploy",
      "health_check",
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

  it("returns abstained when budget is exhausted", async () => {
    const { result, threw } = await runFactoryTest({ exhaustedBudget: true });
    expect(threw).toBe(false);
    expect(result!.status).toBe("abstained");
  }, temporalTimeoutMs);

  it("fails security violations without running agents", async () => {
    const { calls, threw } = await runFactoryTest({ securityPassed: false });
    expect(threw).toBe(true);
    expect(calls).not.toContain("agent:scout");
    expect(calls).toContain("security_scan");
  }, temporalTimeoutMs);

  it("cleans up worktree on abstain", async () => {
    const { calls, threw } = await runFactoryTest({ exhaustedBudget: true });
    expect(threw).toBe(false);
    expect(calls.some((call) => call.startsWith("cleanup:"))).toBe(true);
  }, temporalTimeoutMs);

  it("handles cancellation with cancelled status", async () => {
    const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
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
});
