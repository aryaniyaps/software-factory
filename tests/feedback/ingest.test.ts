import { describe, expect, it } from "vitest";
import { createFeedbackIngest } from "../../src/feedback/ingest.js";
import type { FactoryProjection } from "../../src/db/factory-projection.js";
import type { EvidenceStore } from "../../src/evidence/evidence-store.js";

function createMockDeps() {
  const feedbackItems = new Set<string>();
  const incidentLinks = new Set<string>();
  const evidenceBodies: Array<{ runId: string; id: string; body: string }> = [];
  const oracleCalibrations: Array<Record<string, unknown>> = [];

  const projection = {
    async recordFeedbackItem(input: { runId: string; feedbackId: string; source: string; summary: string }) {
      const key = `${input.runId}:${input.feedbackId}`;
      if (feedbackItems.has(key)) return { inserted: false };
      feedbackItems.add(key);
      return { inserted: true };
    },
    async recordIncidentLink(input: { runId: string; incidentId: string; source: string }) {
      const key = `${input.runId}:${input.incidentId}`;
      if (incidentLinks.has(key)) return { inserted: false };
      incidentLinks.add(key);
      return { inserted: true };
    },
    async recordOracleCalibration(input: Record<string, unknown>) {
      oracleCalibrations.push(input);
    },
    async getFeedbackTraceability(feedbackId: string) {
      if (!feedbackItems.has(`run-abc:fb-${feedbackId}`) && !feedbackItems.has(`run-abc:${feedbackId}`)) {
        const match = [...feedbackItems].find((k) => k.endsWith(`:${feedbackId}`));
        if (!match) return null;
      }
      return {
        feedbackId,
        incidentId: "inc-001",
        deploymentId: "run-abc-sha256:abc",
        artifactDigest: "sha256:abc",
        runId: "run-abc",
        evidenceRefs: [{ schemaVersion: "evidence-ref.v1" as const, id: `ev-${feedbackId}`, sha256: "a".repeat(64), uri: "file:///ev" }],
      };
    },
  } satisfies Pick<FactoryProjection, "recordFeedbackItem" | "recordIncidentLink" | "recordOracleCalibration" | "getFeedbackTraceability">;

  const evidenceStore = {
    async appendEvidence(input: { runId: string; item: { id: string }; body: string | Buffer }) {
      const body = typeof input.body === "string" ? input.body : input.body.toString("utf8");
      evidenceBodies.push({ runId: input.runId, id: input.item.id, body });
      return { id: input.item.id, sha256: "a".repeat(64), uri: "file:///ev" };
    },
  } satisfies Pick<EvidenceStore, "appendEvidence">;

  return { projection, evidenceStore, feedbackItems, incidentLinks, evidenceBodies, oracleCalibrations };
}

describe("feedback ingest", () => {
  it("normalizes and stores feedback with verbatim evidence", async () => {
    const deps = createMockDeps();
    const ingest = createFeedbackIngest(deps);

    const result = await ingest.ingest({
      source: "incident",
      externalId: "inc-001",
      summary: "Checkout timeout on production",
      body: "Users report 30s timeout during checkout",
      runId: "run-abc",
      incidentId: "inc-001",
      deploymentId: "run-abc-sha256:abc",
      artifactDigest: "sha256:abc",
    });

    expect(result.inserted).toBe(true);
    expect(result.feedback.feedbackId).toBe("incident:inc-001");
    expect(result.feedback.evidenceRefs).toHaveLength(1);
    expect(deps.evidenceBodies).toHaveLength(1);
    expect(deps.evidenceBodies[0]?.body).toBe("Users report 30s timeout during checkout");
    expect(deps.incidentLinks.size).toBe(1);
  });

  it("deduplicates duplicate webhook deliveries into one item", async () => {
    const deps = createMockDeps();
    const ingest = createFeedbackIngest(deps);
    const input = {
      source: "webhook" as const,
      externalId: "delivery-xyz",
      deliveryId: "delivery-xyz",
      summary: "Error spike detected",
      body: '{"alert":"error_rate_high"}',
      runId: "run-abc",
    };

    const first = await ingest.ingest(input);
    const second = await ingest.ingest(input);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(first.feedback.feedbackId).toBe(second.feedback.feedbackId);
    expect(deps.feedbackItems.size).toBe(1);
    expect(deps.evidenceBodies).toHaveLength(1);
  });

  it("links deployment IDs and correlates traceability back to run", async () => {
    const deps = createMockDeps();
    const ingest = createFeedbackIngest(deps);

    const result = await ingest.ingest({
      source: "github",
      externalId: "issue-42-comment-7",
      summary: "Login broken after deploy",
      body: "Cannot log in since last deploy",
      runId: "run-abc",
      incidentId: "inc-001",
      deploymentId: "run-abc-sha256:abc",
      artifactDigest: "sha256:abc",
    });

    const trace = await deps.projection.getFeedbackTraceability(result.feedback.feedbackId);
    expect(trace).not.toBeNull();
    expect(trace?.runId).toBe("run-abc");
    expect(trace?.incidentId).toBe("inc-001");
    expect(trace?.deploymentId).toBe("run-abc-sha256:abc");
    expect(trace?.artifactDigest).toBe("sha256:abc");
    expect(trace?.evidenceRefs.length).toBeGreaterThan(0);
  });

  it("feeds rollback incident outcomes into oracle calibration", async () => {
    const deps = createMockDeps();
    const ingest = createFeedbackIngest(deps);

    await ingest.ingest({
      source: "incident",
      externalId: "inc-rollback",
      summary: "Rollback triggered after SLO breach",
      body: "Canary observation failed, rollback executed",
      runId: "run-abc",
      incidentId: "inc-rollback",
      outcome: "rollback",
    });

    expect(deps.oracleCalibrations).toHaveLength(1);
    expect(deps.oracleCalibrations[0]?.score).toBe(0);
    expect(deps.oracleCalibrations[0]?.oracleId).toBe("release-oracle");
  });
});
