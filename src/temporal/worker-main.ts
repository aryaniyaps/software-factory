import { createTemporalWorker } from "./worker.js";
import { TASK_QUEUES } from "./task-queues.js";

export interface ProductionWorker {
  run(): Promise<void>;
}

export interface ProductionWorkerOptions {
  workflowsPath: string;
  activities: Record<string, (...args: any[]) => Promise<any>>;
  createWorker?: (options: { taskQueue: string; workflowsPath: string; activities: Record<string, (...args: any[]) => Promise<any>> }) => Promise<ProductionWorker>;
}

export async function createProductionWorkers(options: ProductionWorkerOptions): Promise<ProductionWorker[]> {
  const createWorker = options.createWorker ?? createTemporalWorker;
  return Promise.all(Object.values(TASK_QUEUES).map((taskQueue) => createWorker({
    taskQueue,
    workflowsPath: options.workflowsPath,
    activities: options.activities,
  })));
}

export async function runProductionWorkers(options: ProductionWorkerOptions): Promise<void> {
  await Promise.all((await createProductionWorkers(options)).map((worker) => worker.run()));
}
