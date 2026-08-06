import type { WorkflowClientLike } from "./client.js";
import { TemporalWorkflowStarter } from "./client.js";
import { createProductionWorkers, type ProductionWorkerOptions } from "./worker-main.js";
import { ProjectReconciler } from "../tasks/reconciler.js";
import type { TaskProvider } from "../tasks/task-provider.js";
import { createFeedbackIngest } from "../feedback/ingest.js";
import { FeedbackReconciler } from "../feedback/reconciler.js";
import { createFeedbackApiStore } from "../api/feedback-api.js";

export function createProductionApplication(options: ProductionWorkerOptions & {
  taskProvider: TaskProvider;
  workflowClient: WorkflowClientLike;
  projection?: import("../db/factory-projection.js").FactoryProjection;
  evidenceStore?: import("../evidence/evidence-store.js").EvidenceStore;
  repository?: string;
  close: () => Promise<void>;
}) {
  const reconciler = new ProjectReconciler(options.taskProvider, new TemporalWorkflowStarter(options.workflowClient));
  const feedback = options.projection && options.evidenceStore
    ? new FeedbackReconciler({
      ingest: createFeedbackIngest({ projection: options.projection, evidenceStore: options.evidenceStore }),
      projection: options.projection,
      workflows: new TemporalWorkflowStarter(options.workflowClient),
      repository: options.repository ?? "org/repo",
    })
    : undefined;

  return {
    reconciler,
    feedback,
    feedbackApi: feedback ? createFeedbackApiStore(feedback) : undefined,
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
