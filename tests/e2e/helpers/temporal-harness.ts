import { ProjectReconciler } from "../../../src/tasks/reconciler.js";
import type { FactoryTask } from "../../../src/tasks/task-provider.js";

export function runConcurrentTasks(tasks: FactoryTask[]): Promise<string[]> {
  const started: string[] = [];
  const provider = {
    listReady: async () => tasks,
    updateStatus: async () => {},
  };
  const workflows = {
    start: async (input: { taskId: string }) => {
      started.push(input.taskId);
    },
  };
  return new ProjectReconciler(provider, workflows).reconcile().then(() => started);
}
