import type { CorpusCase, CorpusVersion } from "./corpus.js";
import {
  replayCorpus,
  summarizeReplayResults,
  type ReplayEvaluator,
  type ReplaySummary,
} from "./replay.js";

export type FactoryChangeKind = "evaluator" | "prompt" | "model" | "tool" | "policy";

export interface GamingAgent {
  readonly id: string;
  readonly description: string;
  readonly evaluator: ReplayEvaluator;
}

function gamingEvaluator(
  id: string,
  behavior: (caseItem: CorpusCase) => ReplayEvaluator["replay"] extends (c: CorpusCase) => infer R ? R : never,
): ReplayEvaluator {
  return {
    id,
    replay(caseItem) {
      return behavior(caseItem);
    },
  };
}

export const GAMING_AGENTS: readonly GamingAgent[] = [
  {
    id: "gaming-always-pass",
    description: "Trivial agent that always reports success",
    evaluator: gamingEvaluator("gaming-always-pass", (caseItem) => ({
      caseId: caseItem.id,
      evaluatorId: "gaming-always-pass",
      success: true,
      costTokens: 1,
      durationMs: caseItem.metrics.durationMs,
      incidents: 0,
      maintainabilityDelta: 10,
      variance: 0,
    })),
  },
  {
    id: "gaming-always-fail",
    description: "Trivial agent that always reports failure",
    evaluator: gamingEvaluator("gaming-always-fail", (caseItem) => ({
      caseId: caseItem.id,
      evaluatorId: "gaming-always-fail",
      success: false,
      costTokens: caseItem.metrics.costTokens,
      durationMs: caseItem.metrics.durationMs,
      incidents: caseItem.metrics.incidents,
      maintainabilityDelta: caseItem.metrics.maintainabilityDelta ?? 0,
      variance: caseItem.metrics.variance ?? 0.1,
    })),
  },
  {
    id: "gaming-random",
    description: "Agent with unstable random outcomes",
    evaluator: gamingEvaluator("gaming-random", (caseItem) => {
      const seed = caseItem.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const success = seed % 2 === 0;
      return {
        caseId: caseItem.id,
        evaluatorId: "gaming-random",
        success,
        costTokens: caseItem.metrics.costTokens,
        durationMs: caseItem.metrics.durationMs,
        incidents: success ? 0 : 1,
        maintainabilityDelta: success ? 1 : -1,
        variance: 0.8,
      };
    }),
  },
  {
    id: "gaming-high-variance",
    description: "Agent with high variance but optimistic headline metrics",
    evaluator: gamingEvaluator("gaming-high-variance", (caseItem) => ({
      caseId: caseItem.id,
      evaluatorId: "gaming-high-variance",
      success: caseItem.outcome === "success",
      costTokens: caseItem.metrics.costTokens * 0.5,
      durationMs: caseItem.metrics.durationMs,
      incidents: 0,
      maintainabilityDelta: 5,
      variance: 0.95,
    })),
  },
];

export interface GamingAgentResult {
  readonly agentId: string;
  readonly results: ReturnType<typeof replayCorpus>;
  readonly summary: ReplaySummary;
}

export function runGamingAgents(corpus: CorpusVersion): GamingAgentResult[] {
  return GAMING_AGENTS.map((agent) => {
    const results = replayCorpus(corpus, agent.evaluator);
    return {
      agentId: agent.id,
      results,
      summary: summarizeReplayResults(results),
    };
  });
}

export interface ValidateEvaluatorOutcomeInput {
  readonly corpus: CorpusVersion;
  readonly replaySummary: ReplaySummary;
  readonly gamingSummaries: readonly ReplaySummary[];
}

export interface ValidateEvaluatorOutcomeResult {
  readonly valid: boolean;
  readonly reason: string;
}

export function validateEvaluatorOutcome(
  input: ValidateEvaluatorOutcomeInput,
): ValidateEvaluatorOutcomeResult {
  const alwaysPass = input.gamingSummaries.find((summary) => summary.evaluatorId === "gaming-always-pass");
  if (!alwaysPass) {
    return { valid: false, reason: "Missing gaming-always-pass baseline" };
  }

  if (input.replaySummary.successRate >= 0.99 && input.replaySummary.variance <= alwaysPass.variance) {
    return {
      valid: false,
      reason: "Evaluator outcome is indistinguishable from gaming-always-pass",
    };
  }

  const highVariance = input.gamingSummaries.find((summary) => summary.evaluatorId === "gaming-high-variance");
  if (highVariance && input.replaySummary.variance >= highVariance.variance) {
    return {
      valid: false,
      reason: "Evaluator variance is not better than gaming-high-variance",
    };
  }

  if (input.replaySummary.sampleCount !== input.corpus.cases.length) {
    return {
      valid: false,
      reason: "Evaluator did not cover the full corpus",
    };
  }

  return { valid: true, reason: "Evaluator outcome passed gaming controls" };
}

export function preventsEvaluatorSelfPromotion(
  evaluatorId: string,
  candidateEvaluatorId: string,
): boolean {
  return evaluatorId === candidateEvaluatorId;
}

export interface PromoteFactoryChangeInput {
  readonly changeId: string;
  readonly changeKind: FactoryChangeKind;
  readonly evaluatorId: string;
  readonly candidateEvaluatorId: string;
  readonly replayImproves: boolean;
  readonly shadowScore: number;
  readonly canaryScore: number;
  readonly currentScore?: number;
  readonly minImprovement?: number;
}

export interface PromoteFactoryChangeDecision {
  readonly promoted: boolean;
  readonly reason: string;
  readonly changeId: string;
}

export function canPromoteFactoryChange(
  input: PromoteFactoryChangeInput,
): PromoteFactoryChangeDecision {
  if (preventsEvaluatorSelfPromotion(input.evaluatorId, input.candidateEvaluatorId)) {
    return {
      promoted: false,
      reason: "Rejected evaluator self-promotion",
      changeId: input.changeId,
    };
  }

  if (!input.replayImproves) {
    return {
      promoted: false,
      reason: "Replay did not improve across success, cost, variance, incident and maintainability effects",
      changeId: input.changeId,
    };
  }

  const currentScore = input.currentScore ?? 0;
  const minImprovement = input.minImprovement ?? 0.05;
  if (input.shadowScore < currentScore + minImprovement) {
    return {
      promoted: false,
      reason: "Shadow evidence did not exceed current score with required improvement",
      changeId: input.changeId,
    };
  }

  if (input.canaryScore < currentScore + minImprovement) {
    return {
      promoted: false,
      reason: "Canary evidence did not exceed current score with required improvement",
      changeId: input.changeId,
    };
  }

  return {
    promoted: true,
    reason: `Promoted ${input.changeKind} ${input.changeId} after replay, shadow and canary evidence`,
    changeId: input.changeId,
  };
}
