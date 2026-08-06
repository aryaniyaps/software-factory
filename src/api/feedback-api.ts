import type { FeedbackReconciler } from "../feedback/reconciler.js";
import type { FeedbackIngestInput } from "../feedback/ingest.js";
import { parseIncidentWebhook } from "../feedback/adapters/incident.js";
import { parseGenericWebhook } from "../feedback/adapters/webhook.js";

export interface FeedbackApiStore {
  ingestFeedback(input: FeedbackIngestInput): Promise<{ inserted: boolean; feedbackId: string }>;
  getFeedbackTrace(feedbackId: string): Promise<unknown>;
}

export function createFeedbackApiStore(reconciler: FeedbackReconciler): FeedbackApiStore {
  return {
    async ingestFeedback(input) {
      const result = await reconciler.reconcile(input);
      return {
        inserted: result.ingest.inserted,
        feedbackId: result.ingest.feedback.feedbackId,
      };
    },
    async getFeedbackTrace(feedbackId) {
      return reconciler.getTraceability(feedbackId);
    },
  };
}

export interface IncidentApiInput {
  incidentId: string;
  summary: string;
  body: string;
  runId: string;
  artifactDigest?: string;
  outcome?: "rollback" | "resolved" | "open";
  deliveryId?: string;
}

export function incidentInputFromBody(body: IncidentApiInput, deliveryId: string): FeedbackIngestInput {
  return parseIncidentWebhook({
    incidentId: body.incidentId,
    summary: body.summary,
    body: body.body,
    runId: body.runId,
    artifactDigest: body.artifactDigest,
    outcome: body.outcome,
  }, body.deliveryId ?? deliveryId);
}

export function webhookInputFromBody(
  body: { externalId?: string; summary: string; body: string; runId: string; incidentId?: string; artifactDigest?: string },
  deliveryId: string,
): FeedbackIngestInput {
  return parseGenericWebhook({
    externalId: body.externalId ?? deliveryId,
    summary: body.summary,
    body: body.body,
    runId: body.runId,
    incidentId: body.incidentId,
    artifactDigest: body.artifactDigest,
  }, deliveryId);
}
