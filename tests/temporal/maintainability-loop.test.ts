import { describe, expect, it } from "vitest";
import type { AgentOutput } from "../../src/contracts/nodes.js";
import { DEFAULT_WORKFLOW_BUDGET } from "../../src/policy/retry-policy.js";
import { DEFAULT_MAINTAINABILITY_POLICY } from "../../src/assurance/maintainability/policy.js";
import { buildMaintainabilityReport } from "../../src/assurance/maintainability/report.js";
import { assessCriticReports } from "../../src/assurance/maintainability/critic.js";
import type { FitnessRunResult } from "../../src/assurance/fitness/types.js";
import { runMaintainabilityLoop } from "../../src/temporal/workflows/maintainability-loop.js";

function agentOutput(summary = "ok"): AgentOutput {
  return {
    schemaVersion: "agent-output.v1",
    role: "repair",
    status: "succeeded",
    summary,
    evidenceRefs: ["ev-repair-1"],
    data: { mode: "maintainability_refactor" },
  };
}

function passAssessment() {
  const fitness: FitnessRunResult = {
    outcome: "pass",
    policyVersion: "test",
    shadowMode: true,
    findings: [],
    rawSubScores: [],
    missingCapabilities: [],
  };
  const critic = assessCriticReports({
    requiredCritics: 0,
    evidence: {
      workOrderId: "wo-1",
      acceptanceIds: ["acc-1"],
      blueprintRefs: [],
      fitnessFindingRefs: [],
      diffRefs: [],
      graphRefs: [],
      behavioralEvidenceRefs: [],
    },
    reports: [],
  });
  const report = buildMaintainabilityReport(fitness, critic);
  return {
    outcome: "pass" as const,
    report,
    reasons: [],
  };
}

describe("maintainability loop workflow", () => {
  it("passes when the first assessment passes", async () => {
    const result = await runMaintainabilityLoop({
      runId: "run-1",
      budget: { ...DEFAULT_WORKFLOW_BUDGET },
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      assess: async () => passAssessment(),
      runBehaviorChecks: async () => ({ passed: true, output: "ok" }),
      runRefactor: async () => agentOutput(),
    });
    expect(result.passed).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.assessAttempts).toHaveLength(1);
    expect(result.refactorAttempts).toHaveLength(0);
  });

  it("runs bounded refactor batches and reassesses", async () => {
    let assessCount = 0;
    const result = await runMaintainabilityLoop({
      runId: "run-2",
      budget: { ...DEFAULT_WORKFLOW_BUDGET, maxRepairAttempts: 2 },
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      assess: async () => {
        assessCount += 1;
        if (assessCount === 1) {
          const fitness: FitnessRunResult = {
            outcome: "pass",
            policyVersion: "test",
            shadowMode: true,
            findings: [],
            rawSubScores: [],
            missingCapabilities: [],
          };
          const critic = assessCriticReports({
            requiredCritics: 1,
            evidence: {
              workOrderId: "wo-1",
              acceptanceIds: ["acc-1"],
              blueprintRefs: [],
              fitnessFindingRefs: [],
              diffRefs: [],
              graphRefs: [],
              behavioralEvidenceRefs: [],
            },
            reports: [{
              schemaVersion: "critic-report.v1",
              criticId: "critic-a",
              findings: [{
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
              }],
            }],
          });
          return {
            outcome: "repairable",
            report: buildMaintainabilityReport(fitness, critic),
            repairScope: {
              mode: "maintainability_refactor",
              findingIds: ["finding-1"],
              affectedSymbols: ["src/billing/invoice.ts::InvoiceService"],
              allowedPaths: ["src/billing/invoice.ts"],
              minimumRepairs: ["use BillingPort"],
              forbiddenActions: ["downgrade findings", "change gate policy"],
            },
            reasons: [{ code: "CRITIC_BLOCK", message: "forbidden import" }],
          };
        }
        return passAssessment();
      },
      runBehaviorChecks: async () => ({ passed: true, output: "ok" }),
      runRefactor: async () => agentOutput("refactored"),
    });
    expect(result.passed).toBe(true);
    expect(result.refactorAttempts).toHaveLength(1);
    expect(result.behaviorAttempts).toHaveLength(1);
    expect(result.assessAttempts.length).toBeGreaterThanOrEqual(2);
  });

  it("fails when refactor improves metrics but behavior checks fail", async () => {
    const result = await runMaintainabilityLoop({
      runId: "run-3",
      budget: { ...DEFAULT_WORKFLOW_BUDGET },
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      assess: async () => ({
        outcome: "repairable",
        report: passAssessment().report,
        repairScope: {
          mode: "maintainability_refactor",
          findingIds: ["finding-1"],
          affectedSymbols: ["src/core.ts::Core"],
          allowedPaths: ["src/core.ts"],
          minimumRepairs: ["reduce complexity"],
          forbiddenActions: ["downgrade findings"],
        },
        reasons: [{ code: "BASELINE_REGRESSION", message: "complexity" }],
      }),
      runBehaviorChecks: async () => ({ passed: false, output: "tests failed" }),
      runRefactor: async () => agentOutput("metrics improved"),
    });
    expect(result.passed).toBe(false);
    expect(result.failed).toBe(true);
  });

  it("fails when contradictory evidence cannot be resolved", async () => {
    const result = await runMaintainabilityLoop({
      runId: "run-4",
      budget: { ...DEFAULT_WORKFLOW_BUDGET },
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      assess: async () => ({
        outcome: "policy_block",
        report: passAssessment().report,
        reasons: [{ code: "CONTRADICTION_UNRESOLVED", message: "critics disagree" }],
      }),
      runBehaviorChecks: async () => ({ passed: true, output: "ok" }),
      runRefactor: async () => agentOutput(),
    });
    expect(result.failed).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("fails when refactor attempts are exhausted", async () => {
    const result = await runMaintainabilityLoop({
      runId: "run-5",
      budget: { ...DEFAULT_WORKFLOW_BUDGET, maxRepairAttempts: 1 },
      policy: { ...DEFAULT_MAINTAINABILITY_POLICY, maxRefactorAttempts: 1 },
      assess: async () => ({
        outcome: "repairable",
        report: passAssessment().report,
        repairScope: {
          mode: "maintainability_refactor",
          findingIds: ["finding-1"],
          affectedSymbols: ["src/core.ts::Core"],
          allowedPaths: ["src/core.ts"],
          minimumRepairs: ["reduce complexity"],
          forbiddenActions: ["downgrade findings"],
        },
        reasons: [{ code: "CRITIC_BLOCK", message: "still blocked" }],
      }),
      runBehaviorChecks: async () => ({ passed: true, output: "ok" }),
      runRefactor: async () => agentOutput(),
    });
    expect(result.failed).toBe(true);
    expect(result.refactorAttempts).toHaveLength(1);
  });

  it("records maintainability refactor attempts on the shared repair node", async () => {
    const refactorInputs: Array<{ scope: { mode: string }; attempt: number }> = [];
    let assessCount = 0;
    const result = await runMaintainabilityLoop({
      runId: "run-6",
      budget: { ...DEFAULT_WORKFLOW_BUDGET },
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      assess: async () => {
        assessCount += 1;
        if (assessCount === 1) {
          return {
            outcome: "repairable",
            report: passAssessment().report,
            repairScope: {
              mode: "maintainability_refactor",
              findingIds: ["finding-1"],
              affectedSymbols: ["src/core.ts::Core"],
              allowedPaths: ["src/core.ts"],
              minimumRepairs: ["reduce complexity"],
              forbiddenActions: ["downgrade findings"],
            },
            reasons: [{ code: "CRITIC_BLOCK", message: "blocked" }],
          };
        }
        return passAssessment();
      },
      runBehaviorChecks: async () => ({ passed: true, output: "ok" }),
      runRefactor: async (scope, attempt) => {
        refactorInputs.push({ scope, attempt });
        return agentOutput(`refactor-${attempt}`);
      },
    });
    expect(result.passed).toBe(true);
    expect(result.refactorAttempts).toHaveLength(1);
    expect(result.refactorAttempts[0].node).toBe("repair");
    expect(result.refactorAttempts[0].attemptId).toContain("repair-1");
    expect(refactorInputs[0]).toMatchObject({
      scope: { mode: "maintainability_refactor" },
      attempt: 1,
    });
  });
});
