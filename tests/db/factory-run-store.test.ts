import { describe, expect, it } from "vitest";
import { createFactoryRunStore } from "../../src/db/factory-run-store.js";

describe("FactoryRunStore", () => {
  it("creates a factory run projection and task event", async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const pool = {
      query: async (text: string, values: unknown[] = []) => {
        queries.push({ text, values });
        if (text.includes("FROM factory_events")) {
          return { rows: [{ event_id: "task-created:run-1", type: "task.created", payload: {}, created_at: "2026-08-06T00:00:00.000Z" }] };
        }
        if (text.includes("FROM factory_runs")) {
          return {
            rows: [{
              run_id: "run-1",
              workflow_id: "factory-run-1",
              task_id: "run-1",
              status: "pending",
              current_node: null,
              failure_reason: null,
            }],
          };
        }
        return { rows: [] };
      },
    };
    const store = createFactoryRunStore(pool as never);
    const runId = await store.createTask({
      repository: "https://github.com/acme/app.git",
      title: "Fix",
      description: "Do it",
    });

    expect(runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(queries.some((q) => q.text.includes("INSERT INTO factory_runs"))).toBe(true);
    expect(queries.some((q) => q.text.includes("INSERT INTO factory_events") && q.values.includes("task.created"))).toBe(true);
  });

  it("cancels by updating the factory run projection", async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const store = createFactoryRunStore({
      query: async (text: string, values: unknown[] = []) => {
        queries.push({ text, values });
        return { rows: [] };
      },
    } as never);

    await store.cancelRun("run-1");

    expect(queries.some((q) => q.text.includes("INSERT INTO factory_runs") && q.values.includes("cancelled"))).toBe(true);
  });
});
