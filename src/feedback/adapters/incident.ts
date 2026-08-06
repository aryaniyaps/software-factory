import type { FeedbackIngestInput } from "../ingest.js";
import { buildDeploymentId, type IncidentOutcome } from "../types.js";

export interface IncidentWebhookPayload {
  incidentId: string;
  summary: string;
  body: string;
  runId: string;
  artifactDigest?: string;
  outcome?: IncidentOutcome;
}

export function parseIncidentWebhook(
  payload: IncidentWebhookPayload,
  deliveryId: string,
): FeedbackIngestInput {
  const deploymentId = payload.artifactDigest
    ? buildDeploymentId(payload.runId, payload.artifactDigest)
    : undefined;

  return {
    source: "incident",
    externalId: payload.incidentId,
    deliveryId,
    summary: payload.summary,
    body: payload.body,
    runId: payload.runId,
    incidentId: payload.incidentId,
    deploymentId,
    artifactDigest: payload.artifactDigest,
    outcome: payload.outcome,
  };
}
