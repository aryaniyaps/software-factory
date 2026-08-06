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
      expect(toolsForRole("scout")).toEqual(["read", "grep", "find", "ls", "web_search", "resolve-library-id", "query-docs"]);
      expect(toolsForRole("plan")).toEqual(["read", "grep", "find", "ls", "web_search", "resolve-library-id", "query-docs"]);
      expect(toolsForRole("implement")).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls", "resolve-library-id", "query-docs"]);
      expect(toolsForRole("repair")).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls", "web_search", "resolve-library-id", "query-docs"]);
      expect(toolsForRole("review")).toEqual(["read", "grep", "find", "ls", "web_search", "resolve-library-id", "query-docs", "get_evidence", "list_evidence_meta"]);
      expect(toolsForRole("maintainability_critic")).toEqual(["read", "grep", "find", "ls", "resolve-library-id", "query-docs", "get_evidence"]);
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
    it("documents Drizzle onConflict semantics for projection writes", () => {
      const source = readFileSync(join(repoRoot, "src/db/factory-projection.ts"), "utf8");
      expect(source).toContain("onConflictDoUpdate");
      expect(source).toContain("onConflictDoNothing");
      expect(source).toContain("db.transaction");
    });

    it("points integration coverage at tests/db/factory-projection.test.ts", () => {
      const source = readFileSync(join(repoRoot, "tests/db/factory-projection.test.ts"), "utf8");
      expect(source).toContain("upserts runs, events, artifacts, and deployments idempotently");
      expect(source).toContain("writes outbox events inside a transaction and deduplicates repeats");
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
