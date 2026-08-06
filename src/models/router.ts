import { preventsEvaluatorSelfPromotion } from "../evaluation/validity.js";
import type { RiskTier } from "../policy/work-policy.js";
import {
  bestObservationForRoute,
  routeEvidenceScore,
  type WeatherReport,
} from "./weather-report.js";

export interface ModelRoute {
  readonly role: string;
  readonly taskType: string;
  readonly riskTier: RiskTier;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly routeVersion: string;
  readonly evidenceVersion: string;
  readonly evidenceScore: number;
  readonly selectionReason?: string;
  readonly evidenceRefs?: readonly string[];
  readonly shadowModelId?: string;
  readonly shadowScore?: number;
  readonly canaryPercentage?: number;
}

export interface RouteQuery {
  readonly role: string;
  readonly taskType: string;
  readonly riskTier: RiskTier;
}

export function selectModelRoute(report: WeatherReport, query: RouteQuery): ModelRoute {
  const observation = bestObservationForRoute(report, query);
  if (!observation) {
    throw new Error(`No empirical route evidence for ${query.role}/${query.taskType}/${query.riskTier}`);
  }

  return {
    role: query.role,
    taskType: query.taskType,
    riskTier: query.riskTier,
    modelId: observation.modelId,
    modelVersion: observation.modelVersion,
    routeVersion: `${report.reportVersion}:${observation.modelId}`,
    evidenceVersion: observation.evidenceVersion,
    evidenceScore: routeEvidenceScore(observation),
    selectionReason: `Selected ${observation.modelId} using empirical evidence from weather report ${report.reportVersion}`,
    evidenceRefs: [observation.evidenceVersion, `${observation.modelId}:${observation.modelVersion}`],
  };
}

export function startShadowRoute(current: ModelRoute, candidate: ModelRoute): ModelRoute {
  return {
    ...candidate,
    shadowModelId: candidate.modelId,
    shadowScore: candidate.shadowScore ?? candidate.evidenceScore,
    canaryPercentage: 0,
    evidenceRefs: [
      ...(current.evidenceRefs ?? [current.evidenceVersion]),
      `shadow:${candidate.modelId}`,
      candidate.evidenceVersion,
    ],
  };
}

export function advanceCanaryRoute(route: ModelRoute, percentage: number): ModelRoute {
  return {
    ...route,
    canaryPercentage: percentage,
    evidenceRefs: [
      ...(route.evidenceRefs ?? [route.evidenceVersion]),
      `canary:${percentage}`,
    ],
  };
}

export interface PromoteModelRouteInput {
  readonly current: ModelRoute;
  readonly candidate: ModelRoute;
  readonly evaluatorId: string;
  readonly candidateEvaluatorId: string;
  readonly minImprovement?: number;
}

export interface PromoteModelRouteDecision {
  readonly promoted: boolean;
  readonly reason: string;
  readonly route: ModelRoute;
}

export function promoteModelRoute(input: PromoteModelRouteInput): PromoteModelRouteDecision {
  if (preventsEvaluatorSelfPromotion(input.evaluatorId, input.candidateEvaluatorId)) {
    return {
      promoted: false,
      reason: "Rejected evaluator self-promotion",
      route: input.current,
    };
  }

  const minImprovement = input.minImprovement ?? 0.05;
  const shadowScore = input.candidate.shadowScore ?? input.candidate.evidenceScore;
  if (shadowScore < input.current.evidenceScore + minImprovement) {
    return {
      promoted: false,
      reason: "Shadow route evidence did not exceed current route score",
      route: input.current,
    };
  }

  if ((input.candidate.canaryPercentage ?? 0) <= 0) {
    return {
      promoted: false,
      reason: "Canary traffic was not enabled for candidate route",
      route: input.current,
    };
  }

  if (input.candidate.evidenceScore < input.current.evidenceScore + minImprovement) {
    return {
      promoted: false,
      reason: "Candidate route evidence did not improve over current route",
      route: input.current,
    };
  }

  return {
    promoted: true,
    reason: `Promoted route ${input.candidate.routeVersion} with shadow and canary evidence`,
    route: {
      ...input.candidate,
      evidenceRefs: [
        ...(input.candidate.evidenceRefs ?? [input.candidate.evidenceVersion]),
        `promoted:${input.candidate.routeVersion}`,
      ],
    },
  };
}

export function rollbackModelRoute(current: ModelRoute, previous: ModelRoute): ModelRoute {
  return {
    ...previous,
    evidenceRefs: [
      ...(previous.evidenceRefs ?? [previous.evidenceVersion]),
      `rollback-from:${current.routeVersion}`,
    ],
  };
}
