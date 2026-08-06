import type { WorkflowClientLike } from "./client.js";
import { TemporalWorkflowStarter } from "./client.js";
import { createProductionWorkers, type ProductionWorkerOptions } from "./worker-main.js";
import { ProjectReconciler } from "../tasks/reconciler.js";
import type { TaskProvider } from "../tasks/task-provider.js";

export function createProductionApplication(options: ProductionWorkerOptions & {
  taskProvider: TaskProvider;
  workflowClient: WorkflowClientLike;
  close: () => Promise<void>;
}) {
  const reconciler = new ProjectReconciler(options.taskProvider, new TemporalWorkflowStarter(options.workflowClient));
  return {
    reconciler,
    reconcile: () => reconciler.reconcile(),
    startWorkers: async () => {
      const workers = await createProductionWorkers(options);
      await Promise.all(workers.map((worker) => worker.run()));
    },
    close: async () => {
      await options.close();
    },
  };
}
