import type { ExecutionsService } from "../../src/api/executions-service.js";

export function fakeExecutions(): ExecutionsService {
  return {
    async createExecution() { return { workflowId: "factory-run-1", runId: "run-1" }; },
    async listExecutions() { return []; },
    async getExecution() { return null; },
    async command() {},
    async getObject() { return Buffer.from(""); },
  };
}
