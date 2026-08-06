import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createFactoryRunStore } from "../../src/db/factory-run-store.js";
import { factoryEvents, factoryRuns } from "../../src/db/schema.js";
import { closeTestDatabase, getTestDatabase, isPostgresAvailable, resetTestDatabase, truncateTestTables } from "./test-database.js";

describe("FactoryRunStore", () => {
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

  it("creates a factory run projection and task event", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const store = createFactoryRunStore(db);

    const runId = await store.createTask({
      repository: "https://github.com/acme/app.git",
      title: "Fix",
      description: "Do it",
    });

    expect(runId).toMatch(/^[0-9a-f-]{36}$/);

    const run = await store.getRun(runId);
    expect(run).toMatchObject({
      runId,
      status: "pending",
      events: [{
        type: "task.created",
        payload: {
          repository: "https://github.com/acme/app.git",
          title: "Fix",
          description: "Do it",
        },
      }],
    });

    const runs = await db.select().from(factoryRuns).where(eq(factoryRuns.runId, runId));
    const events = await db.select().from(factoryEvents).where(eq(factoryEvents.runId, runId));
    expect(runs).toHaveLength(1);
    expect(events.some((event) => event.type === "task.created")).toBe(true);
  });

  it("cancels by updating the factory run projection", async ({ skip }) => {
    if (!available) skip();
    const db = await getTestDatabase();
    const store = createFactoryRunStore(db);
    const runId = await store.createTask({
      repository: "https://github.com/acme/app.git",
      title: "Fix",
      description: "Do it",
    });

    await store.cancelRun(runId);

    const [run] = await db.select().from(factoryRuns).where(eq(factoryRuns.runId, runId));
    expect(run?.status).toBe("cancelled");
    expect(await store.getRun(runId)).toMatchObject({ status: "cancelled" });
  });
});
