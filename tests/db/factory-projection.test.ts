import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { createFactoryProjection } from "../../src/db/factory-projection.js";
import {
  evidenceItems,
  factoryArtifacts,
  factoryDeployments,
  factoryEvents,
  factoryEventOutbox,
  factoryRuns,
  gateDecisions,
} from "../../src/db/schema.js";
import { closeTestDatabase, getTestDatabase, isPostgresAvailable, resetTestDatabase, truncateTestTables } from "./test-database.js";

describe("FactoryProjection", () => {
  let available = false;

  beforeAll(async () => {
    available = await isPostgresAvailable();
    if (!available) return;
    await resetTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    if (!available) return;
    await truncateTestTables();
  });

  afterAll(async () => {
    if (available) await closeTestDatabase();
  });

  it("upserts runs, events, artifacts, and deployments idempotently", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);
    const digest = `registry/app@sha256:${"a".repeat(64)}`;

    await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "running" });
    await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "cancelled" });
    await projection.recordEvent({ runId: "run", eventId: "event-1", type: "started", payload: { node: "scout" } });
    await projection.recordEvent({ runId: "run", eventId: "event-1", type: "started", payload: { node: "scout" } });
    await projection.recordArtifact({ runId: "run", digest, image: "registry/app" });
    await projection.recordArtifact({ runId: "run", digest, image: "registry/app:v2" });
    await projection.recordDeployment({ runId: "run", profile: "staging", digest, status: "healthy" });
    await projection.recordDeployment({ runId: "run", profile: "staging", digest, status: "degraded" });

    const [run] = await db.select().from(factoryRuns).where(eq(factoryRuns.runId, "run"));
    expect(run?.status).toBe("cancelled");

    const events = await db.select().from(factoryEvents).where(eq(factoryEvents.runId, "run"));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ node: "scout" });

    const artifacts = await db.select().from(factoryArtifacts).where(eq(factoryArtifacts.runId, "run"));
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.image).toBe("registry/app:v2");

    const deployments = await db.select().from(factoryDeployments).where(eq(factoryDeployments.runId, "run"));
    expect(deployments[0]?.status).toBe("degraded");
  });

  it("writes outbox events inside a transaction and deduplicates repeats", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);

    await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "running" });

    const first = await projection.recordEventOutbox({
      runId: "run",
      eventId: "evt-1",
      type: "node.started",
      payload: { node: "scout" },
    });
    const second = await projection.recordEventOutbox({
      runId: "run",
      eventId: "evt-1",
      type: "node.started",
      payload: { node: "scout" },
    });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);

    const outbox = await db.select().from(factoryEventOutbox).where(eq(factoryEventOutbox.runId, "run"));
    const events = await db.select().from(factoryEvents).where(eq(factoryEvents.runId, "run"));
    expect(outbox).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("rolls back failed transactions without leaving partial rows", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);
    await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "running" });

    await expect(db.transaction(async (tx) => {
      await tx.insert(factoryEvents).values({
        runId: "run",
        eventId: "evt-rollback",
        type: "node.failed",
        payload: { node: "scout" },
      });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");

    const events = await db.select().from(factoryEvents).where(eq(factoryEvents.runId, "run"));
    expect(events).toHaveLength(0);
  });

  it("maps JSONB payloads and paginates evidence item ids", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);
    await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "running" });

    for (const [index, id] of ["ev-b", "ev-a", "ev-c"].entries()) {
      await projection.recordEvidenceItem({
        runId: "run",
        id,
        kind: "agent_output",
        schemaVersion: "evidence.v1",
        mediaType: "application/json",
        sha256: `${index}`.repeat(64).slice(0, 64),
        uri: `s3://evidence/${id}`,
        producer: { type: "agent", id: "scout", version: "1" },
        subject: { node: "scout", index: String(index) },
        createdAt: `2026-08-06T12:0${index}:00.000Z`,
        redaction: "none",
      });
    }

    const ids = await projection.listEvidenceItemIds("run");
    expect(ids).toEqual(["ev-b", "ev-a", "ev-c"]);

    const [stored] = await db
      .select()
      .from(evidenceItems)
      .where(eq(evidenceItems.id, "ev-a"));
    expect(stored?.subject).toEqual({ node: "scout", index: "1" });
    expect(stored?.createdAt.toISOString()).toBe("2026-08-06T12:01:00.000Z");
  });

  it("stores gate decisions with timestamp keys", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);
    await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "running" });

    const decidedAt = "2026-08-06T15:30:00.000Z";
    await projection.recordGateDecision({
      runId: "run",
      gateId: "review",
      decision: "pass",
      policyVersion: "v1",
      reasons: [{ code: "coverage" }],
      evidenceRefs: ["ev-1"],
      decidedAt,
    });
    await projection.recordGateDecision({
      runId: "run",
      gateId: "review",
      decision: "pass",
      policyVersion: "v1",
      reasons: [{ code: "coverage" }],
      evidenceRefs: ["ev-1"],
      decidedAt,
    });

    const keys = await projection.listGateDecisionKeys("run");
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(`review@${decidedAt}`);

    const rows = await db
      .select()
      .from(gateDecisions)
      .where(eq(gateDecisions.runId, "run"))
      .orderBy(asc(gateDecisions.decidedAt));
    expect(rows[0]?.reasons).toEqual([{ code: "coverage" }]);
    expect(rows[0]?.evidenceRefs).toEqual(["ev-1"]);
  });
});
