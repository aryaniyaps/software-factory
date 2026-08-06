import type { ApiStore } from "./server.js";
import { startFactoryWorkflow, type FactoryWorkflowInput, type WorkflowClientLike } from "../temporal/client.js";

export function createProductionApi(input: { store: ApiStore; workflowClient: WorkflowClientLike }): ApiStore {
  return {
    async createTask(task) {
      const runId = await input.store.createTask(task);
      const workflow: FactoryWorkflowInput = {
        runId,
        taskId: runId,
        repository: task.repository,
        baseBranch: "main",
        workflow: "feature",
        deploymentProfile: "staging",
        sandboxProfile: "crabbox",
      };
      await startFactoryWorkflow(input.workflowClient, workflow);
      return runId;
    },
    getRun: (id) => input.store.getRun(id),
    getEvents: input.store.getEvents ? (id) => input.store.getEvents!(id) : undefined,
    async cancelRun(id) {
      if (!input.workflowClient.workflow.getHandle) throw new Error(`unsupported run cancellation: ${id}`);
      await input.workflowClient.workflow.getHandle(`factory-${id}`).signal("cancelFactory");
      await input.store.cancelRun(id);
    },
  };
}
