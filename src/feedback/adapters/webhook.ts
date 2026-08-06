import type { FeedbackIngestInput } from "../ingest.js";

export interface GenericWebhookPayload {
  externalId: string;
  summary: string;
  body: string;
  runId: string;
  incidentId?: string;
  artifactDigest?: string;
}

export function parseGenericWebhook(
  payload: GenericWebhookPayload,
  deliveryId: string,
): FeedbackIngestInput {
  return {
    source: "webhook",
    externalId: payload.externalId || deliveryId,
    deliveryId,
    summary: payload.summary,
    body: payload.body,
    runId: payload.runId,
    incidentId: payload.incidentId,
    artifactDigest: payload.artifactDigest,
  };
}
