import { describe, expect, it } from "vitest";
import { createProductionApplication } from "../../src/temporal/application.js";

describe("production application", () => {
  it("binds reconciliation and worker startup to injected production dependencies", async () => {
    const started: string[] = [];
    let closed = false;
    const app = createProductionApplication({
      workflowsPath: "/factory/workflows.js",
      activities: {},
      taskProvider: { listReady: async () => [], updateStatus: async () => {} },
      workflowClient: { workflow: { start: async () => { started.push("workflow"); return {}; } } },
      close: async () => { closed = true; },
      createWorker: async ({ taskQueue }) => { started.push(taskQueue); return { run: async () => {} }; },
    });
    await app.reconcile();
    await app.startWorkers();
    expect(started).toEqual(["factory-control", "factory-agent", "factory-build", "factory-deploy", "factory-verifier"]);
    await app.close();
    expect(closed).toBe(true);
  });
});
