import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createEvidenceStore } from "../../src/evidence/evidence-store.js";
import { createFilesystemObjectStore } from "../../src/evidence/object-store.js";
import { createFactoryProjection } from "../../src/db/factory-projection.js";
import { evidenceItems, evidenceManifests } from "../../src/db/schema.js";
import { closeTestDatabase, getTestDatabase, isPostgresAvailable, resetTestDatabase, truncateTestTables } from "./test-database.js";

describe("evidence spine schema", () => {
  it("defines append-only projection tables in the production baseline", async () => {
    const schema = await readFile(new URL("../../drizzle/0000_soft_otto_octavius.sql", import.meta.url), "utf8");
    const required = [
      "factory_node_attempts",
      "agent_sessions",
      "agent_turns",
      "tool_calls",
      "evidence_items",
      "gate_decisions",
      "scenario_runs",
      "fitness_results",
      "deployment_observations",
      "incident_links",
      "feedback_items",
      "oracle_calibrations",
      "evidence_manifests",
      "factory_event_outbox",
      "probe_runs",
    ];
    for (const table of required) {
      expect(schema).toContain(table);
    }
    expect(schema).not.toMatch(/CREATE TABLE IF NOT EXISTS runs\b/);
    expect(schema).not.toMatch(/DROP TABLE/i);
  });
});

describe("evidence store projection", () => {
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

  it("writes events idempotently inside a transaction", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);
    const objectStore = createFilesystemObjectStore("/tmp/evidence-test");
    const store = createEvidenceStore({ projection, objectStore, maxInlineBytes: 0 });

    await projection.recordRun({ runId: "run-1", workflowId: "factory-run-1", taskId: "run-1", status: "running" });

    const first = await store.appendEvent({ runId: "run-1", eventId: "evt-1", type: "node.started", payload: { node: "scout" } });
    const second = await store.appendEvent({ runId: "run-1", eventId: "evt-1", type: "node.started", payload: { node: "scout" } });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
  });

  it("stores large bodies in object storage, not postgres rows", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);
    const objectStore = createFilesystemObjectStore("/tmp/evidence-test");
    const store = createEvidenceStore({ projection, objectStore, maxInlineBytes: 0 });
    const largeBody = "x".repeat(64_000);

    await projection.recordRun({ runId: "run-1", workflowId: "factory-run-1", taskId: "run-1", status: "running" });
    await store.appendEvidence({
      runId: "run-1",
      item: {
        id: "ev-large",
        kind: "agent_output",
        schemaVersion: "evidence.v1",
        mediaType: "text/plain",
        producer: { type: "agent", id: "scout", version: "1" },
        subject: { sessionId: "s-1" },
        createdAt: "2026-08-06T12:00:00.000Z",
        redaction: "none",
      },
      body: largeBody,
    });

    const [item] = await db.select().from(evidenceItems).where(eq(evidenceItems.id, "ev-large"));
    expect(item?.uri).toContain("ev-large");
    expect(item?.sha256).toHaveLength(64);

    const [manifest] = await db.select().from(evidenceManifests).where(eq(evidenceManifests.runId, "run-1"));
    expect(manifest?.manifest).toMatchObject({ evidenceItemIds: ["ev-large"] });
  });

  it("fails closed when declared hash does not match body", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const projection = createFactoryProjection(db);
    const objectStore = createFilesystemObjectStore("/tmp/evidence-test");
    const store = createEvidenceStore({ projection, objectStore, maxInlineBytes: 0 });

    await projection.recordRun({ runId: "run-1", workflowId: "factory-run-1", taskId: "run-1", status: "running" });

    await expect(store.appendEvidence({
      runId: "run-1",
      item: {
        id: "ev-bad",
        kind: "tool_result",
        schemaVersion: "evidence.v1",
        mediaType: "application/json",
        sha256: "b".repeat(64),
        producer: { type: "tool", id: "exec", version: "1" },
        subject: { callId: "c-1" },
        createdAt: "2026-08-06T12:00:00.000Z",
        redaction: "none",
      },
      body: '{"ok":true}',
    })).rejects.toThrow(/hash mismatch/i);
  });
});
