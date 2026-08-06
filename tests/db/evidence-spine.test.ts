import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createEvidenceStore } from "../../src/evidence/evidence-store.js";
import { createFilesystemObjectStore } from "../../src/evidence/object-store.js";
import { createFactoryProjection, type Queryable } from "../../src/db/factory-projection.js";

describe("evidence spine migration", () => {
  it("defines append-only projection tables for clean install and upgrade", async () => {
    const migration = await readFile(new URL("../../src/db/migrations/002_evidence_spine.sql", import.meta.url), "utf8");
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
    ];
    for (const table of required) {
      expect(migration).toContain(table);
    }
    expect(migration).not.toMatch(/DROP TABLE/i);
  });

  it("defines probe run projection table for operations API", async () => {
    const migration = await readFile(new URL("../../src/db/migrations/003_probe_runs.sql", import.meta.url), "utf8");
    expect(migration).toContain("probe_runs");
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});

describe("evidence store projection", () => {
  function createMockDb(): Queryable & { queries: Array<{ text: string; values: unknown[] }> } {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    return {
      queries,
      async query(text, values = []) {
        queries.push({ text, values });
        if (text.trim() === "BEGIN" || text.trim() === "COMMIT") return { rows: [] };
        return { rows: [] };
      },
    };
  }

  it("writes events idempotently inside a transaction", async () => {
    const db = createMockDb();
    const projection = createFactoryProjection(db);
    const objectStore = createFilesystemObjectStore("/tmp/evidence-test");
    const store = createEvidenceStore({ projection, objectStore, maxInlineBytes: 0 });

    await store.appendEvent({ runId: "run-1", eventId: "evt-1", type: "node.started", payload: { node: "scout" } });
    await store.appendEvent({ runId: "run-1", eventId: "evt-1", type: "node.started", payload: { node: "scout" } });

    expect(db.queries.some((q) => q.text.includes("BEGIN"))).toBe(true);
    expect(db.queries.some((q) => q.text.includes("COMMIT"))).toBe(true);
    const outboxWrites = db.queries.filter((q) => q.text.includes("factory_event_outbox"));
    expect(outboxWrites.length).toBeGreaterThanOrEqual(2);
    expect(outboxWrites.every((q) => q.text.includes("ON CONFLICT"))).toBe(true);
  });

  it("stores large bodies in object storage, not postgres rows", async () => {
    const db = createMockDb();
    const projection = createFactoryProjection(db);
    const objectStore = createFilesystemObjectStore("/tmp/evidence-test");
    const store = createEvidenceStore({ projection, objectStore, maxInlineBytes: 0 });
    const largeBody = "x".repeat(64_000);

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

    const evidenceInsert = db.queries.find((q) => q.text.includes("INSERT INTO evidence_items"));
    expect(evidenceInsert).toBeDefined();
    expect(JSON.stringify(evidenceInsert?.values ?? [])).not.toContain(largeBody);
    const manifestUpdate = db.queries.find((q) => q.text.includes("evidence_manifests"));
    expect(manifestUpdate).toBeDefined();
  });

  it("fails closed when declared hash does not match body", async () => {
    const db = createMockDb();
    const projection = createFactoryProjection(db);
    const objectStore = createFilesystemObjectStore("/tmp/evidence-test");
    const store = createEvidenceStore({ projection, objectStore, maxInlineBytes: 0 });

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
