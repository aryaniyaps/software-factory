import { describe, expect, it } from "vitest";
import { createFinding } from "../../../src/assurance/fitness/types.js";
import type { FitnessRunResult } from "../../../src/assurance/fitness/types.js";
import { assessCriticReports } from "../../../src/assurance/maintainability/critic.js";
import {
  assessMaintainability,
  DEFAULT_MAINTAINABILITY_POLICY,
  parseMaintainabilityPolicy,
} from "../../../src/assurance/maintainability/policy.js";
import { buildMaintainabilityReport } from "../../../src/assurance/maintainability/report.js";

function validBlockingFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: "finding-1",
    category: "forbidden_direction",
    severity: "block",
    confidence: 0.9,
    dimension: "modularity",
    affectedSymbols: ["src/billing/invoice.ts::InvoiceService"],
    evidenceRefs: ["ev-fitness-1", "ev-diff-1"],
    violatedInvariant: "billing must not import from presentation layer",
    minimumRepair: "introduce BillingPort in contracts and depend on that",
    falsificationCondition: "show billing imports only from allowed ports",
    explanation: "InvoiceService imports ../../../presentation/views/InvoiceView",
    ...overrides,
  };
}

function fitnessPass(overrides: Partial<FitnessRunResult> = {}): FitnessRunResult {
  return {
    outcome: "pass",
    policyVersion: "test",
    shadowMode: true,
    findings: [],
    rawSubScores: [],
    missingCapabilities: [],
    ...overrides,
  };
}

function criticPass() {
  return assessCriticReports({
    requiredCritics: 1,
    evidence: {
      workOrderId: "wo-1",
      acceptanceIds: ["acc-1"],
      blueprintRefs: ["blueprint://billing"],
      fitnessFindingRefs: ["ev-fitness-1"],
      diffRefs: ["ev-diff-1"],
      graphRefs: ["ev-graph-1"],
      behavioralEvidenceRefs: ["ev-scenario-1"],
    },
    reports: [{
      schemaVersion: "critic-report.v1",
      criticId: "critic-a",
      findings: [validBlockingFinding({ severity: "warn" })],
    }],
  });
}

describe("maintainability policy", () => {
  it("parses maintainability policy documents", () => {
    const policy = parseMaintainabilityPolicy({
      schemaVersion: "maintainability-policy.v1",
      policyVersion: "test",
      maxRefactorAttempts: 2,
      maxEvidenceCollectionRounds: 1,
      baselineRegression: { minRelativeDelta: 0.15, minConfidence: 0.7 },
      contradictionResolution: { maxRounds: 1 },
    });
    expect(policy.maxRefactorAttempts).toBe(2);
    expect(policy.baselineRegression.minRelativeDelta).toBe(0.15);
  });

  it("passes when fitness and critic agree with warnings only", () => {
    const result = assessMaintainability({
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      fitness: fitnessPass({
        findings: [
          createFinding({
            adapterId: "eslint",
            ruleId: "eslint-complexity",
            dimension: "analysability",
            severity: "warn",
            confidence: 0.6,
            locations: [{ file: "src/a.ts", line: 10 }],
            evidenceRefs: ["ev-eslint-1"],
            explanation: "complexity warning",
            shadowOnly: true,
          }),
        ],
      }),
      critic: criticPass(),
      evidenceCollectionRounds: 0,
    });
    expect(result.outcome).toBe("pass");
    expect(result.report.vector.length).toBeGreaterThan(0);
    expect(result.report.vector.every((entry) => !("aggregateScore" in entry))).toBe(true);
  });

  it("blocks hard fitness policy violations", () => {
    const result = assessMaintainability({
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      fitness: fitnessPass({
        outcome: "policy_block",
        findings: [
          createFinding({
            adapterId: "dependency-cruiser",
            ruleId: "dependency-cycle",
            dimension: "modularity",
            severity: "block",
            confidence: 1,
            locations: [{ file: "src/a.ts" }],
            evidenceRefs: ["ev-cycle-1"],
            explanation: "new dependency cycle",
          }),
        ],
      }),
      critic: criticPass(),
      evidenceCollectionRounds: 0,
    });
    expect(result.outcome).toBe("policy_block");
  });

  it("marks baseline regressions as repairable", () => {
    const result = assessMaintainability({
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      fitness: fitnessPass({
        findings: [
          createFinding({
            adapterId: "eslint",
            ruleId: "eslint-complexity",
            dimension: "analysability",
            severity: "warn",
            confidence: 0.85,
            baseline: 10,
            candidate: 25,
            delta: 15,
            locations: [{ file: "src/core.ts", line: 42 }],
            evidenceRefs: ["ev-eslint-2"],
            explanation: "changed-code complexity regressed materially",
          }),
        ],
      }),
      critic: criticPass(),
      evidenceCollectionRounds: 0,
    });
    expect(result.outcome).toBe("repairable");
    expect(result.repairScope?.affectedSymbols).toContain("src/core.ts");
  });

  it("does not pass on critic block alone without fitness corroboration when policy requires dual evidence", () => {
    const criticBlock = assessCriticReports({
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
        findings: [validBlockingFinding()],
      }],
    });
    const result = assessMaintainability({
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      fitness: fitnessPass(),
      critic: criticBlock,
      evidenceCollectionRounds: 0,
    });
    expect(result.outcome).toBe("repairable");
    expect(result.repairScope?.findingIds.length).toBeGreaterThan(0);
  });

  it("requests evidence collection for contradictory critic reports", () => {
    const critic = assessCriticReports({
      requiredCritics: 2,
      evidence: {
        workOrderId: "wo-1",
        acceptanceIds: ["acc-1"],
        blueprintRefs: [],
        fitnessFindingRefs: [],
        diffRefs: [],
        graphRefs: [],
        behavioralEvidenceRefs: [],
      },
      reports: [
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-a",
          findings: [validBlockingFinding()],
        },
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-b",
          findings: [validBlockingFinding({ id: "finding-2", severity: "warn" })],
        },
      ],
    });
    const result = assessMaintainability({
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      fitness: fitnessPass(),
      critic,
      evidenceCollectionRounds: 0,
    });
    expect(result.outcome).toBe("insufficient_evidence");
    expect(result.collectEvidenceRequests?.length).toBeGreaterThan(0);
  });

  it("abstains when contradictory evidence remains unresolved", () => {
    const critic = assessCriticReports({
      requiredCritics: 2,
      evidence: {
        workOrderId: "wo-1",
        acceptanceIds: ["acc-1"],
        blueprintRefs: [],
        fitnessFindingRefs: [],
        diffRefs: [],
        graphRefs: [],
        behavioralEvidenceRefs: [],
      },
      reports: [
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-a",
          findings: [validBlockingFinding()],
        },
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-b",
          findings: [validBlockingFinding({ id: "finding-2", severity: "warn" })],
        },
      ],
    });
    const result = assessMaintainability({
      policy: DEFAULT_MAINTAINABILITY_POLICY,
      fitness: fitnessPass(),
      critic,
      evidenceCollectionRounds: 1,
    });
    expect(result.outcome).toBe("policy_block");
    expect(result.reasons.some((reason) => reason.code === "CONTRADICTION_UNRESOLVED")).toBe(true);
  });

  it("combines fitness and critic evidence without collapsing the vector", () => {
    const fitness = fitnessPass({
      findings: [
        createFinding({
          adapterId: "eslint",
          ruleId: "eslint-complexity",
          dimension: "analysability",
          severity: "warn",
          confidence: 0.5,
          locations: [{ file: "src/a.ts" }],
          evidenceRefs: ["ev-eslint-1"],
          explanation: "warn",
        }),
      ],
      rawSubScores: [{
        adapterId: "eslint",
        metric: "eslint-complexity",
        baseline: 5,
        candidate: 6,
        delta: 1,
        raw: { explanation: "warn" },
      }],
    });
    const critic = criticPass();
    const report = buildMaintainabilityReport(fitness, critic);
    expect(report.fitnessFindings).toHaveLength(1);
    expect(report.criticFindings).toHaveLength(1);
    expect(report.rawSubScores).toHaveLength(1);
    expect(report.vector.find((entry) => entry.dimension === "analysability")).toBeDefined();
    expect(report.vector.find((entry) => entry.dimension === "modularity")).toBeDefined();
  });
});
