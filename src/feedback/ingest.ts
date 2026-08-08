import type { EvidenceStore } from "../evidence/evidence-store.js";
import type { EvidenceRef } from "../contracts/evidence.js";
import {
  feedbackIdFor,
  type FeedbackSource,
  type IncidentOutcome,
  type NormalizedFeedback,
} from "./types.js";

export interface FeedbackIngestInput {
  readonly source: FeedbackSource;
  readonly externalId: string;
  readonly deliveryId?: string;
  readonly summary: string;
  readonly body: string;
  readonly runId: string;
  readonly incidentId?: string;
  readonly deploymentId?: string;
  readonly artifactDigest?: string;
  readonly outcome?: IncidentOutcome;
}

export interface FeedbackIngestResult {
  readonly inserted: boolean;
  readonly feedback: NormalizedFeedback;
}

export interface FeedbackIngestDependencies {
  readonly projection: FeedbackProjection;
  readonly evidenceStore: Pick<EvidenceStore, "appendEvidence">;
}

export interface FeedbackProjection {
  recordFeedbackItem(input: { runId: string; feedbackId: string; source: string; summary: string }): Promise<{ inserted: boolean }>;
  recordIncidentLink(input: { runId: string; incidentId: string; source: string }): Promise<{ inserted: boolean }>;
  recordOracleCalibration(input: { runId: string; oracleId: string; calibrationId: string; score: number }): Promise<void>;
  getFeedbackTraceability(feedbackId: string): Promise<import("./types.js").FeedbackTraceability | null>;
}

export interface FeedbackIngest {
  ingest(input: FeedbackIngestInput): Promise<FeedbackIngestResult>;
}

export function feedbackDedupKey(source: FeedbackSource, externalId: string): string {
  return feedbackIdFor(source, externalId);
}

function oracleScoreForOutcome(outcome: IncidentOutcome): number {
  if (outcome === "rollback") return 0;
  if (outcome === "resolved") return 1;
  return 0.5;
}

export function createFeedbackIngest(deps: FeedbackIngestDependencies): FeedbackIngest {
  return {
    async ingest(input) {
      const feedbackId = feedbackDedupKey(input.source, input.externalId);
      const evidenceId = `feedback-${feedbackId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
      const createdAt = new Date().toISOString();

      const { inserted } = await deps.projection.recordFeedbackItem({
        runId: input.runId,
        feedbackId,
        source: input.source,
        summary: input.summary,
      });

      let evidenceRef: EvidenceRef | undefined;
      if (inserted) {
        const stored = await deps.evidenceStore.appendEvidence({
          runId: input.runId,
          item: {
            id: evidenceId,
            kind: "incident",
            schemaVersion: "evidence.v1",
            mediaType: "text/plain",
            producer: { type: "feedback-ingest", id: input.source, version: "1" },
            subject: {
              feedbackId,
              externalId: input.externalId,
              ...(input.incidentId ? { incidentId: input.incidentId } : {}),
              ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
              ...(input.artifactDigest ? { artifactDigest: input.artifactDigest } : {}),
            },
            createdAt,
            redaction: "none",
          },
          body: input.body,
        });
        evidenceRef = {
          schemaVersion: "evidence-ref.v1",
          id: stored.id,
          sha256: stored.sha256,
          uri: stored.uri,
        };
      }

      if (input.incidentId) {
        await deps.projection.recordIncidentLink({
          runId: input.runId,
          incidentId: input.incidentId,
          source: input.source,
        });
      }

      if (input.outcome) {
        await deps.projection.recordOracleCalibration({
          runId: input.runId,
          oracleId: "release-oracle",
          calibrationId: `incident-${input.incidentId ?? input.externalId}`,
          score: oracleScoreForOutcome(input.outcome),
        });
      }

      const feedback: NormalizedFeedback = {
        feedbackId,
        source: input.source,
        externalId: input.externalId,
        summary: input.summary,
        evidenceRefs: evidenceRef ? [evidenceRef] : [],
        incidentId: input.incidentId,
        deploymentId: input.deploymentId,
        runId: input.runId,
        artifactDigest: input.artifactDigest,
      };

      return { inserted, feedback };
    },
  };
}
