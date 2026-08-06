import { describe, expect, it } from "vitest";
import {
  assessCriticReports,
  stripImplementerNarrative,
  type CriticEvidenceBundle,
} from "../../../src/assurance/maintainability/critic.js";
import {
  parseCriticFinding,
  parseCriticReport,
  SMELL_TAXONOMY,
} from "../../../src/assurance/maintainability/findings.js";

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
    falsificationCondition: "show billing imports only from allowed ports per factory/fitness/default.yaml",
    explanation: "InvoiceService imports ../../../presentation/views/InvoiceView",
    ...overrides,
  };
}

describe("maintainability critic findings", () => {
  it("encodes the complete smell taxonomy from the specification", () => {
    expect(SMELL_TAXONOMY.change_amplification).toContain("shotgun_surgery");
    expect(SMELL_TAXONOMY.coupling_boundaries).toContain("dependency_cycle");
    expect(SMELL_TAXONOMY.cognitive_control_flow).toContain("long_complex_function");
    expect(SMELL_TAXONOMY.dispensables).toContain("duplicate_code_knowledge");
    expect(SMELL_TAXONOMY.test_smells).toContain("missing_behavior_coverage");
    expect(SMELL_TAXONOMY.operational).toContain("non_idempotent_retryable_side_effect");
    expect(Object.values(SMELL_TAXONOMY).flat()).toHaveLength(47);
  });

  it("accepts a schema-valid blocking finding with concrete evidence", () => {
    const finding = parseCriticFinding(validBlockingFinding());
    expect(finding.severity).toBe("block");
    expect(finding.affectedSymbols).toHaveLength(1);
  });

  it("rejects evidence-free blocking findings", () => {
    expect(() => parseCriticFinding(validBlockingFinding({ evidenceRefs: [] }))).toThrow(/evidence/i);
    expect(() => parseCriticFinding(validBlockingFinding({ affectedSymbols: [] }))).toThrow(/symbol/i);
    expect(() => parseCriticFinding(validBlockingFinding({ violatedInvariant: "" }))).toThrow(/invariant/i);
    expect(() => parseCriticFinding(validBlockingFinding({ falsificationCondition: "" }))).toThrow(/falsification/i);
  });

  it("downgrades aesthetic-only findings so prose cannot block", () => {
    const report = parseCriticReport({
      schemaVersion: "critic-report.v1",
      criticId: "critic-a",
      findings: [
        validBlockingFinding({
          category: "long_complex_function",
          severity: "block",
          explanation: "this function feels messy and hard to read",
        }),
      ],
    });
    expect(report.findings[0]?.severity).toBe("warn");
  });

  it("rejects unknown smell categories", () => {
    expect(() => parseCriticFinding(validBlockingFinding({ category: "mystery_smell" }))).toThrow();
  });
});

describe("maintainability critic assessment", () => {
  const evidence: CriticEvidenceBundle = {
    workOrderId: "wo-1",
    acceptanceIds: ["acc-1"],
    blueprintRefs: ["blueprint://billing"],
    fitnessFindingRefs: ["ev-fitness-1"],
    diffRefs: ["ev-diff-1"],
    graphRefs: ["ev-graph-1"],
    behavioralEvidenceRefs: ["ev-scenario-1"],
  };

  it("strips implementer narrative from critic inputs", () => {
    const sanitized = stripImplementerNarrative({
      ...evidence,
      implementerSummary: "I kept it simple on purpose",
      implementerReasoning: "hidden chain of thought",
    });
    expect(sanitized).not.toHaveProperty("implementerSummary");
    expect(sanitized).not.toHaveProperty("implementerReasoning");
    expect(sanitized.workOrderId).toBe("wo-1");
  });

  it("passes when critics return no blocking findings", () => {
    const result = assessCriticReports({
      requiredCritics: 1,
      evidence,
      reports: [{
        schemaVersion: "critic-report.v1",
        criticId: "critic-a",
        findings: [{
          ...validBlockingFinding(),
          severity: "warn",
        }],
      }],
    });
    expect(result.outcome).toBe("pass");
  });

  it("blocks when a validated critic finding has block severity", () => {
    const result = assessCriticReports({
      requiredCritics: 1,
      evidence,
      reports: [{
        schemaVersion: "critic-report.v1",
        criticId: "critic-a",
        findings: [validBlockingFinding()],
      }],
    });
    expect(result.outcome).toBe("block");
    expect(result.blockingFindings).toHaveLength(1);
  });

  it("requires evidence expansion when independent critics disagree", () => {
    const result = assessCriticReports({
      requiredCritics: 2,
      evidence,
      reports: [
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-a",
          findings: [validBlockingFinding()],
        },
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-b",
          findings: [{
            ...validBlockingFinding({ id: "finding-2", severity: "warn" }),
          }],
        },
      ],
    });
    expect(result.outcome).toBe("expand_evidence");
    expect(result.disagreements).toHaveLength(1);
  });

  it("does not majority-pass when one critic blocks and another abstains from findings", () => {
    const result = assessCriticReports({
      requiredCritics: 2,
      evidence,
      reports: [
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-a",
          findings: [validBlockingFinding()],
        },
        {
          schemaVersion: "critic-report.v1",
          criticId: "critic-b",
          findings: [],
        },
      ],
    });
    expect(result.outcome).toBe("expand_evidence");
  });
});
