import { describe, expect, it } from "vitest";
import { createApiServer } from "../../src/api/server.js";
import type { ExecutionsService } from "../../src/api/executions-service.js";

function service(): ExecutionsService {
  return {
    async createExecution() { return { workflowId: "factory-run-1", runId: "run-1" }; },
    async listExecutions() { return []; },
    async getExecution() { return null; },
    async command() {},
    async getObject() { return Buffer.from("body"); },
  };
}

describe("factory execution API", () => {
  it("exposes the hard-cutover execution routes", async () => {
    const executions = service();
    executions.getExecution = async (workflowId) => workflowId === "factory-run-1" ? ({
      schemaVersion: "factory-execution-view.v2",
      workflowId,
      runId: "run-1",
    } as never) : null;
    const server = createApiServer({ executions });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/executions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "/repo", title: "Health", description: "Add health" }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ workflowId: "factory-run-1", runId: "run-1" });
    expect((await fetch(`${base}/tasks`)).status).toBe(404);
    expect((await fetch(`${base}/runs/run-1`)).status).toBe(404);

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("routes all mutations through one command endpoint", async () => {
    const commands: unknown[] = [];
    const executions = service();
    executions.command = async (workflowId, command) => { commands.push({ workflowId, command }); };
    const server = createApiServer({ executions, apiToken: "secret" });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/executions/factory-run-1/commands`, {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ type: "rerun_node", node: "repair" }),
    });
    expect(response.status).toBe(202);
    expect(commands).toEqual([{ workflowId: "factory-run-1", command: { type: "rerun_node", node: "repair" } }]);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
