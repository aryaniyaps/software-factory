import { describe, expect, it } from "vitest";
import { buildCorpusVersion, type CorpusCase } from "../../src/evaluation/corpus.js";
import { summarizeReplayResults } from "../../src/evaluation/replay.js";
import {
  GAMING_AGENTS,
  canPromoteFactoryChange,
  preventsEvaluatorSelfPromotion,
  runGamingAgents,
  validateEvaluatorOutcome,
} from "../../src/evaluation/validity.js";

function caseOf(id: string, outcome: CorpusCase["outcome"]): CorpusCase {
  return {
    id,
    outcome,
    role: "review",
    riskTier: "T2",
    taskSummary: `task ${id}`,
    metrics: {
      costTokens: 5_000,
      durationMs: 30_000,
      incidents: outcome === "incident" ? 1 : 0,
      maintainabilityDelta: 0,
      variance: 0.1,
    },
    evidenceRefs: [`evidence://${id}`],
    recordedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("evaluator validity and gaming agents", () => {
  it("exposes trivial and adversarial gaming agents", () => {
    expect(GAMING_AGENTS.map((agent) => agent.id)).toEqual([
      "gaming-always-pass",
      "gaming-always-fail",
      "gaming-random",
      "gaming-high-variance",
    ]);
  });

  it("detects when an evaluator outcome is too optimistic against gaming agents", () => {
    const corpus = buildCorpusVersion("corpus.v1", [
      caseOf("success-1", "success"),
      caseOf("failed-1", "failed"),
      caseOf("incident-1", "incident"),
      caseOf("abstained-1", "abstained"),
    ]);

    const gamingResults = runGamingAgents(corpus);
    const alwaysPass = gamingResults.find((result) => result.agentId === "gaming-always-pass");
    expect(alwaysPass?.summary.successRate).toBe(1);
    expect(validateEvaluatorOutcome({
      corpus,
      replaySummary: alwaysPass!.summary,
      gamingSummaries: gamingResults.map((result) => result.summary),
    }).valid).toBe(false);

    const honestSummary = summarizeReplayResults(
      gamingResults.find((result) => result.agentId === "gaming-always-fail")!.results,
    );
    expect(validateEvaluatorOutcome({
      corpus,
      replaySummary: honestSummary,
      gamingSummaries: gamingResults.map((result) => result.summary),
    }).valid).toBe(true);
  });

  it("prevents an evaluator from grading or promoting itself", () => {
    expect(preventsEvaluatorSelfPromotion("factory-evaluator", "factory-evaluator")).toBe(true);
    expect(preventsEvaluatorSelfPromotion("factory-evaluator", "independent-evaluator")).toBe(false);

    const decision = canPromoteFactoryChange({
      changeId: "evaluator-v2",
      changeKind: "evaluator",
      evaluatorId: "factory-evaluator",
      candidateEvaluatorId: "factory-evaluator",
      replayImproves: true,
      shadowScore: 0.9,
      canaryScore: 0.88,
      minImprovement: 0.05,
    });

    expect(decision.promoted).toBe(false);
    expect(decision.reason).toMatch(/self-promotion/i);
  });

  it("requires shadow and canary evidence before promoting factory changes", () => {
    const rejected = canPromoteFactoryChange({
      changeId: "prompt-v3",
      changeKind: "prompt",
      evaluatorId: "independent-evaluator",
      candidateEvaluatorId: "prompt-v3",
      replayImproves: true,
      shadowScore: 0.5,
      canaryScore: 0.4,
      minImprovement: 0.05,
      currentScore: 0.7,
    });
    expect(rejected.promoted).toBe(false);
    expect(rejected.reason).toMatch(/shadow|canary/i);

    const promoted = canPromoteFactoryChange({
      changeId: "model-route-v4",
      changeKind: "model",
      evaluatorId: "independent-evaluator",
      candidateEvaluatorId: "model-route-v4",
      replayImproves: true,
      shadowScore: 0.82,
      canaryScore: 0.8,
      minImprovement: 0.05,
      currentScore: 0.7,
    });
    expect(promoted.promoted).toBe(true);
    expect(promoted.reason).toMatch(/shadow|canary|replay/i);
  });
});
