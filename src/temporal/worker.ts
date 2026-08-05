import { NativeConnection } from "@temporalio/worker";
import { Worker } from "@temporalio/worker";
import { TASK_QUEUES } from "./task-queues.js";

export async function createTemporalWorker(options: {
  taskQueue?: string;
  workflowsPath: string;
  activities: Record<string, (...args: never[]) => Promise<unknown>>;
  address?: string;
  namespace?: string;
}): Promise<Worker> {
  const connection = await NativeConnection.connect({ address: options.address ?? process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  return Worker.create({
    connection,
    namespace: options.namespace ?? process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: options.taskQueue ?? TASK_QUEUES.control,
    workflowsPath: options.workflowsPath,
    activities: options.activities,
  });
}
