export interface TechnicalSignals {
  healthOk: boolean;
  errorRate: number;
  latencyP99Ms: number;
}

export interface SemanticSignals {
  productChecksPassed: boolean;
  sloBreaches: readonly string[];
  evidenceMissing?: boolean;
}

export interface ObservationPolicy {
  policyVersion: string;
  maxErrorRate: number;
  maxLatencyP99Ms: number;
  requireSemanticChecks: boolean;
}

export const DEFAULT_OBSERVATION_POLICY: ObservationPolicy = {
  policyVersion: "observation-policy.v1",
  maxErrorRate: 0.05,
  maxLatencyP99Ms: 500,
  requireSemanticChecks: true,
};

export interface ObservationInput {
  policy: ObservationPolicy;
  technical: TechnicalSignals;
  semantic: SemanticSignals;
}

export interface ObservationResult {
  decision: "pass" | "fail" | "insufficient";
  reasons: readonly string[];
}

export function evaluateObservation(input: ObservationInput): ObservationResult {
  const reasons: string[] = [];

  if (!input.technical.healthOk) reasons.push("health_check_failed");
  if (input.technical.errorRate > input.policy.maxErrorRate) reasons.push("error_rate_exceeded");
  if (input.technical.latencyP99Ms > input.policy.maxLatencyP99Ms) reasons.push("latency_p99_exceeded");

  if (input.semantic.evidenceMissing) {
    return { decision: "insufficient", reasons: ["missing_semantic_evidence", ...reasons] };
  }

  if (input.policy.requireSemanticChecks && !input.semantic.productChecksPassed) {
    reasons.push("semantic_check_failed");
  }

  for (const breach of input.semantic.sloBreaches) {
    reasons.push(`semantic_slo_breach:${breach}`);
  }

  if (reasons.length > 0) return { decision: "fail", reasons };
  return { decision: "pass", reasons: [] };
}

export function healthAloneCannotPromote(input: ObservationInput): boolean {
  if (evaluateObservation(input).decision === "pass") return false;
  const healthOnly = evaluateObservation({
    policy: input.policy,
    technical: input.technical,
    semantic: { productChecksPassed: true, sloBreaches: [] },
  });
  return healthOnly.decision === "pass";
}
