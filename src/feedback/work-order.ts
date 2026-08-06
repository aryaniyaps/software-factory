import { classifyRisk } from "../policy/risk-classifier.js";
import type { FeedbackCluster, FeedbackTraceability, GeneratedWorkOrder } from "./types.js";

export const FEEDBACK_REQUIREMENT_IDS = ["REQ-FEEDBACK-LOOP", "REQ-INCIDENT-RESPONSE"] as const;
export const FEEDBACK_ACCEPTANCE_IDS = ["AC-FEEDBACK-TRACEABILITY", "AC-FEEDBACK-DEDUP", "AC-INCIDENT-RESOLUTION"] as const;

export function generateWorkOrder(
  cluster: FeedbackCluster,
  traceability: FeedbackTraceability,
  sequence: number,
): GeneratedWorkOrder {
  const id = `WO-FB-${String(sequence).padStart(3, "0")}`;
  const classification = classifyRisk({
    title: cluster.theme,
    description: cluster.theme,
    workflow: "feature",
  });

  const seen = new Set<string>();
  const evidenceRefs = [...cluster.verbatimEvidenceRefs, ...traceability.evidenceRefs].filter((ref) => {
    if (seen.has(ref.id)) return false;
    seen.add(ref.id);
    return true;
  });

  return {
    id,
    version: 1,
    title: `Fix: ${cluster.theme}`,
    path: `factory/work-orders/${id.toLowerCase()}.md`,
    requirements: [...FEEDBACK_REQUIREMENT_IDS],
    acceptance: [...FEEDBACK_ACCEPTANCE_IDS],
    riskTier: classification.riskTier,
    traceability: {
      ...traceability,
      evidenceRefs,
    },
  };
}
