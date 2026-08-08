import { describe, expect, it } from "vitest";
import { createExecutionsService } from "../../src/api/executions-service.js";
import type { FactoryExecutionViewV2 } from "../../src/contracts/execution.js";
import type { ObjectStore } from "../../src/evidence/object-store.js";

const view: FactoryExecutionViewV2 = {
  schemaVersion: "factory-execution-view.v2",
  workflowId: "factory-run-1",
  runId: "run-1",
  taskId: "run-1",
  repository: "https://github.com/acme/app.git",
  prompt: "Fix it",
  status: "running",
  startedAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  stateRevision: 1,
  graph: {
    version: "factory-graph.v2",
    nodes: [{ id: "repair", label: "repair", kind: "agent", status: "idle", attemptCount: 0 }],
    edges: [],
  },
  attempts: [],
  turns: [],
  toolCalls: [],
  timeline: [],
  outcome: { passed: false, failed: false, rolledBack: false, explanation: "Execution is running." },
};

describe("executions service", () => {
  it("starts protocol v3 and reads/list executions from Temporal", async () => {
    const starts: unknown[] = [];
    const service = createExecutionsService({
      id: () => "run-1",
      workflowClient: {
        workflow: {
          async start(_workflow, options) { starts.push(options); return {}; },
          getHandle() { return { async signal() {}, async query<T>() { return view as T; } }; },
          async *list() { yield { workflowId: "factory-run-1" }; },
        },
      },
      objectStore: emptyObjectStore(),
    });

    const created = await service.createExecution({
      repository: "https://github.com/acme/app.git",
      title: "Fix",
      description: "Fix it",
    });

    expect(created).toEqual({ workflowId: "factory-run-1", runId: "run-1" });
    expect(starts[0]).toMatchObject({
      workflowId: "factory-run-1",
      args: [{ protocolVersion: 3 }],
      searchAttributes: { FactoryExecutionContract: ["factory-execution-view.v2"] },
    });
    expect(await service.getExecution("factory-run-1")).toEqual(view);
    expect(await service.listExecutions()).toEqual([view]);
  });

  it("signals commands and only serves objects referenced by the queried execution", async () => {
    const signals: unknown[][] = [];
    const objectView: FactoryExecutionViewV2 = {
      ...view,
      turns: [{
        schemaVersion: "agent-turn.v2",
        recordId: "turn-1",
        attemptId: "attempt-1",
        sessionId: "session-1",
        turnId: "turn-0",
        turnIndex: 0,
        role: "implement",
        transcript: { objectId: "run-1/body.json", sha256: "a".repeat(64), uri: "memory://run-1/body.json", redaction: "secrets" },
        startedAt: view.startedAt,
        completedAt: view.updatedAt,
      }],
    };
    const objects: ObjectStore = {
      async put() { throw new Error("unused"); },
      async get(path) { return Buffer.from(path); },
      async verify() { return true; },
    };
    const service = createExecutionsService({
      workflowClient: {
        workflow: {
          async start() { return {}; },
          getHandle() {
            return {
              async signal(...args) { signals.push(args); },
              async query<T>() { return objectView as T; },
            };
          },
        },
      },
      objectStore: objects,
    });

    await service.command("factory-run-1", { type: "rerun_node", node: "repair" });
    expect(signals).toEqual([["rerunNode", "repair"]]);
    await expect(service.command("factory-run-1", { type: "rerun_node", node: "review" })).rejects.toThrow("not in this execution graph");
    expect((await service.getObject("factory-run-1", "run-1/body.json")).toString()).toBe("run-1/body.json");
    await expect(service.getObject("factory-run-1", "other.json")).rejects.toThrow("not referenced");
  });
});

function emptyObjectStore(): ObjectStore {
  return {
    async put() { throw new Error("unused"); },
    async get() { throw new Error("unused"); },
    async verify() { return true; },
  };
}
