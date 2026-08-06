import { describe, expect, it } from "vitest";
import {
  buildCorpusVersion,
  type CorpusCase,
} from "../../src/evaluation/corpus.js";
import {
  compareReplayOutcomes,
  replayCorpus,
  summarizeReplayResults,
  type ReplayEvaluator,
} from "../../src/evaluation/replay.js";

function caseOf(
  id: string,
  outcome: CorpusCase["outcome"],
  overrides: Partial<CorpusCase> = {},
): CorpusCase {
  return {
    id,
    outcome,
    role: "implement",
    riskTier: "T1",
    taskSummary: `task ${id}`,
    metrics: {
      costTokens: 10_000,
      durationMs: 60_000,
      incidents: outcome === "incident" ? 1 : 0,
      maintainabilityDelta: outcome === "maintenance" ? -5 : 0,
      variance: 0.1,
    },
    evidenceRefs: [`evidence://${id}`],
    recordedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function evaluator(
  id: string,
  behavior: (corpusCase: CorpusCase) => {
    success: boolean;
    costTokens: number;
    incidents: number;
    maintainabilityDelta: number;
    variance: number;
  },
): ReplayEvaluator {
  return {
    id,
    replay(caseItem) {
      const result = behavior(caseItem);
      return {
        caseId: caseItem.id,
        evaluatorId: id,
        success: result.success,
        costTokens: result.costTokens,
        durationMs: caseItem.metrics.durationMs,
        incidents: result.incidents,
        maintainabilityDelta: result.maintainabilityDelta,
        variance: result.variance,
      };
    },
  };
}

describe("evaluation corpus replay", () => {
  it("builds a versioned corpus from historical outcomes", () => {
    const corpus = buildCorpusVersion("corpus.v1", [
      caseOf("success-1", "success"),
      caseOf("failed-1", "failed"),
      caseOf("abstained-1", "abstained"),
      caseOf("incident-1", "incident"),
      caseOf("maintenance-1", "maintenance"),
    ]);

    expect(corpus.version).toBe("corpus.v1");
    expect(corpus.cases).toHaveLength(5);
    expect(corpus.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(corpus.cases.map((entry) => entry.outcome)).toEqual([
      "success",
      "failed",
      "abstained",
      "incident",
      "maintenance",
    ]);
  });

  it("replays corpus cases and compares success, cost, variance and maintenance effects", () => {
    const corpus = buildCorpusVersion("corpus.v1", [
      caseOf("success-1", "success"),
      caseOf("failed-1", "failed"),
      caseOf("incident-1", "incident"),
    ]);

    const baseline = replayCorpus(corpus, evaluator("baseline", (caseItem) => ({
      success: caseItem.outcome === "success",
      costTokens: caseItem.metrics.costTokens,
      incidents: caseItem.metrics.incidents,
      maintainabilityDelta: caseItem.metrics.maintainabilityDelta ?? 0,
      variance: 0.2,
    })));

    const candidate = replayCorpus(corpus, evaluator("candidate", (caseItem) => ({
      success: caseItem.outcome !== "failed",
      costTokens: caseItem.metrics.costTokens * 0.8,
      incidents: 0,
      maintainabilityDelta: 2,
      variance: 0.05,
    })));

    const baselineSummary = summarizeReplayResults(baseline);
    const candidateSummary = summarizeReplayResults(candidate);
    const comparison = compareReplayOutcomes(baselineSummary, candidateSummary);

    expect(baselineSummary.successRate).toBeCloseTo(1 / 3, 5);
    expect(candidateSummary.successRate).toBeGreaterThan(baselineSummary.successRate);
    expect(candidateSummary.avgCost).toBeLessThan(baselineSummary.avgCost);
    expect(candidateSummary.variance).toBeLessThan(baselineSummary.variance);
    expect(comparison.improves).toBe(true);
    expect(comparison.evidence).toMatch(/success|cost|variance|incident|maintainability/i);
  });
});
