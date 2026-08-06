import type { ApiStore } from "./server.js";
import { startFactoryWorkflow, type FactoryWorkflowInput, type WorkflowClientLike } from "../temporal/client.js";
import { correlationAttributes, extractCorrelationFromRun } from "../telemetry/attributes.js";
import { runInSpan, startTaskIntakeSpan } from "../telemetry/bootstrap.js";

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
      const intakeSpan = startTaskIntakeSpan(extractCorrelationFromRun(workflow));
      intakeSpan.setAttributes(correlationAttributes(extractCorrelationFromRun(workflow)));
      try {
        await runInSpan(intakeSpan, async () => startFactoryWorkflow(input.workflowClient, workflow));
      } finally {
        intakeSpan.end();
      }
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
