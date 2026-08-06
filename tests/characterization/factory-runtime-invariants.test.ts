import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentRoles } from "../../src/contracts/nodes.js";
import { toolsForRole } from "../../src/agents/tool-policy.js";
import { profileForRole, ROLE_PROFILES } from "../../src/agents/role-profiles.js";
import { projectBankId } from "../../src/integrations/hindsight-config.js";
import { memoryBankFromEnv } from "../../src/temporal/production-worker.js";
import { TASK_QUEUES } from "../../src/temporal/task-queues.js";
import { createFactoryProjection } from "../../src/db/factory-projection.js";
import {
  FACTORY_NODE_NAMES,
  MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW,
  recordAttempt,
  toBudgetState,
} from "../../src/temporal/workflows/types.js";
import { DEFAULT_WORKFLOW_BUDGET } from "../../src/policy/retry-policy.js";
import { REPAIR_MODES, REPAIR_ROLE } from "../../src/agents/roles/repair.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

describe("factory runtime invariants", () => {
  describe("production stage topology", () => {
    it("preserves the explicit factory node order", () => {
      expect([...FACTORY_NODE_NAMES]).toEqual([
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

    it("keeps check repair and maintainability refactor on the single repair role", () => {
      expect(REPAIR_ROLE).toBe("repair");
      expect(REPAIR_MODES).toEqual(["diagnostic", "maintainability_refactor"]);
      expect(FACTORY_NODE_NAMES).toContain("repair");
      expect(FACTORY_NODE_NAMES).not.toContain("maintainability_refactor");
    });
  });

  describe("role-memory permissions", () => {
    const workflowRoles = ["scout", "plan", "implement", "repair", "review", "maintainability_critic"] as const;

    it("defines hindsight operations and mental models for every workflow role", () => {
      for (const role of workflowRoles) {
        const profile = profileForRole(role);
        expect(profile.mentalModels.length).toBeGreaterThan(0);
        expect(profile.hindsightOperations.length).toBeGreaterThan(0);
        expect(profile.hindsightOperations).toContain("recall");
      }
    });

    it("restricts maintainability critic to recall-only memory", () => {
      const critic = profileForRole("maintainability_critic");
      expect(critic.hindsightOperations).toEqual(["recall"]);
      expect(critic.mentalModels).toEqual(["architecture", "repository-conventions", "project-history"]);
    });

    it("allows implement to recall and retain but not reflect", () => {
      const implement = profileForRole("implement");
      expect(implement.hindsightOperations).toEqual(["recall", "retain"]);
    });

    it("covers every agent role in the role profile catalog", () => {
      for (const role of AgentRoles) {
        expect(ROLE_PROFILES[role]).toBeDefined();
        expect(toolsForRole(role).length).toBeGreaterThan(0);
      }
    });
  });

  describe("canonical Pi tool permissions", () => {
    it("exposes the phase tool allowlist used by agent activities", () => {
      expect(toolsForRole("scout")).toEqual(["read", "grep", "find", "ls", "context7", "web_search"]);
      expect(toolsForRole("plan")).toEqual(["read", "grep", "find", "ls", "context7", "web_search"]);
      expect(toolsForRole("implement")).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls", "context7"]);
      expect(toolsForRole("repair")).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls", "context7", "web_search"]);
      expect(toolsForRole("review")).toEqual(["read", "grep", "find", "ls", "context7", "web_search"]);
      expect(toolsForRole("maintainability_critic")).toEqual(["read", "grep", "find", "ls", "context7"]);
      expect(toolsForRole("unknown")).toEqual([]);
    });

    it("keeps write-capable roles separate from read-only review", () => {
      expect(toolsForRole("implement")).toContain("write");
      expect(toolsForRole("review")).not.toContain("write");
      expect(toolsForRole("review")).not.toContain("edit");
    });
  });

  describe("bank resolution", () => {
    it("normalizes organization and project into a stable bank id", () => {
      expect(projectBankId("Acme", "Platform")).toBe("acme-platform");
      expect(projectBankId("acme", "platform")).toBe("acme-platform");
      expect(projectBankId("Acme Corp", "Payments API")).toBe("acme-corp-payments-api");
    });

    it("rejects empty organization/project identifiers", () => {
      expect(() => projectBankId("", "")).toThrow("organization and project must contain an identifier");
    });

    it("derives the worker bootstrap bank from environment scope", () => {
      expect(memoryBankFromEnv({ FACTORY_ORGANIZATION: "Acme", FACTORY_PROJECT: "Platform" })).toBe("acme-platform");
      expect(() => memoryBankFromEnv({ FACTORY_ORGANIZATION: "Acme" })).toThrow("FACTORY_ORGANIZATION and FACTORY_PROJECT are required");
    });
  });

  describe("queue isolation", () => {
    it("exposes dedicated execution queues", () => {
      const queues = Object.values(TASK_QUEUES);
      expect(new Set(queues).size).toBe(queues.length);
      expect(queues).toEqual([
        "factory-control",
        "factory-agent",
        "factory-build",
        "factory-deploy",
        "factory-verifier",
      ]);
    });

    it("routes workflow activity proxies to queue-specific task queues", () => {
      const source = readFileSync(join(repoRoot, "src/temporal/workflows/factory-workflow.ts"), "utf8");
      expect(source).toContain(`taskQueue: TASK_QUEUES.control`);
      expect(source).toContain(`taskQueue: TASK_QUEUES.agent`);
      expect(source).toContain(`taskQueue: TASK_QUEUES.build`);
      expect(source).toContain(`taskQueue: TASK_QUEUES.verifier`);
    });

    it("routes release activities to the deploy queue", () => {
      const source = readFileSync(join(repoRoot, "src/temporal/workflows/release-workflow.ts"), "utf8");
      expect(source).toContain(`taskQueue: TASK_QUEUES.deploy`);
    });
  });

  describe("projection idempotency", () => {
    it("uses ON CONFLICT for all primary projection writes", async () => {
      const queries: Array<{ text: string; values: unknown[] }> = [];
      const projection = createFactoryProjection({
        query: async (text, values = []) => {
          queries.push({ text, values });
          return { rows: text.includes("RETURNING") ? [] : [] };
        },
      });

      await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "running" });
      await projection.recordEvent({ runId: "run", eventId: "event-1", type: "started", payload: {} });
      await projection.recordEventOutbox({ runId: "run", eventId: "event-2", type: "outbox", payload: {} });
      await projection.recordArtifact({ runId: "run", digest: `registry/app@sha256:${"a".repeat(64)}`, image: "registry/app" });
      await projection.recordDeployment({ runId: "run", profile: "staging", digest: `registry/app@sha256:${"a".repeat(64)}`, status: "healthy" });
      await projection.recordEvidenceItem({
        runId: "run",
        id: "ev-1",
        kind: "agent_output",
        schemaVersion: "evidence-item.v1",
        mediaType: "application/json",
        sha256: "a".repeat(64),
        uri: "s3://evidence/ev-1",
        producer: { type: "agent", id: "scout", version: "1" },
        subject: { node: "scout" },
        createdAt: "2026-08-06T00:00:00.000Z",
        redaction: "none",
      });
      await projection.recordGateDecision({
        runId: "run",
        gateId: "review",
        decision: "pass",
        policyVersion: "v1",
        reasons: [],
        evidenceRefs: ["ev-1"],
      });
      await projection.recordEvidenceManifest({
        runId: "run",
        hash: "manifest-hash",
        manifest: {
          schemaVersion: "evidence-manifest.v1",
          runId: "run",
          evidenceItemIds: ["ev-1"],
          updatedAt: "2026-08-06T00:00:00.000Z",
        },
      });
      await projection.recordScenarioRun({
        runId: "run",
        scenarioId: "scenario-1",
        attemptId: "attempt-1",
        status: "passed",
        startedAt: "2026-08-06T00:00:00.000Z",
      });
      await projection.recordProbeRun({
        runId: "run",
        probeId: "probe-1",
        attemptId: "attempt-1",
        status: "passed",
        record: {},
      });
      await projection.recordFeedbackItem({ runId: "run", feedbackId: "fb-1", source: "user", summary: "ok" });
      await projection.recordIncidentLink({ runId: "run", incidentId: "inc-1", source: "pagerduty" });
      await projection.recordOracleCalibration({
        runId: "run",
        oracleId: "oracle-1",
        calibrationId: "cal-1",
        score: 0.9,
      });

      const writeQueries = queries.filter(({ text }) => text.includes("INSERT INTO"));
      expect(writeQueries.length).toBeGreaterThanOrEqual(12);
      expect(writeQueries.every(({ text }) => text.includes("ON CONFLICT"))).toBe(true);
    });

    it("deduplicates repeated event projections", async () => {
      const queries: string[] = [];
      const projection = createFactoryProjection({
        query: async (text) => {
          queries.push(text);
          return { rows: [] };
        },
      });
      await projection.recordEvent({ runId: "run", eventId: "event-1", type: "started", payload: { node: "scout" } });
      await projection.recordEvent({ runId: "run", eventId: "event-1", type: "started", payload: { node: "scout" } });
      expect(queries.filter((text) => text.includes("factory_events")).length).toBe(2);
      expect(queries.every((text) => text.includes("ON CONFLICT (run_id, event_id) DO NOTHING"))).toBe(true);
    });
  });

  describe("continueAsNew state preservation", () => {
    it("defines the attempt threshold before continuation", () => {
      expect(MAX_NODE_ATTEMPTS_BEFORE_CONTINUE_AS_NEW).toBe(40);
    });

    it("preserves attempts, budget, and generation in continuation helpers", () => {
      const attempts = [
        { node: "scout" as const, attemptId: "scout-1", status: "succeeded" as const },
        { node: "plan" as const, attemptId: "plan-1", status: "succeeded" as const },
      ];
      const budget = { ...DEFAULT_WORKFLOW_BUDGET, agentAttemptsUsed: 4, repairAttemptsUsed: 1 };
      const merged = recordAttempt(attempts, { node: "implement", attemptId: "implement-1", status: "succeeded" });
      expect(merged).toHaveLength(3);
      expect(toBudgetState(budget)).toEqual(budget);
    });

    it("documents the continuation payload fields carried across generations", () => {
      const source = readFileSync(join(repoRoot, "src/temporal/workflows/factory-workflow.ts"), "utf8");
      expect(source).toContain("continuationGeneration: state.continuationGeneration + 1");
      expect(source).toContain("nodeAttempts: state.nodeAttempts");
      expect(source).toContain("budget: state.budget");
      expect(source).toContain("worktree,");
      expect(source).toContain("agentOutput,");
    });
  });
});
