import type { FactoryTask, TaskProvider } from "./task-provider.js";

export interface WorkflowStarter {
  start(input: {
    runId: string;
    taskId: string;
    repository: string;
    baseBranch: string;
    workflow: string;
    deploymentProfile: string;
    sandboxProfile: string;
  }): Promise<unknown>;
}

export class ProjectReconciler {
  constructor(private readonly provider: TaskProvider, private readonly workflows: WorkflowStarter) {}

  async reconcile(): Promise<void> {
    for (const task of await this.provider.listReady()) {
      await this.workflows.start({
        runId: task.id.replace(/[^a-zA-Z0-9_-]+/g, "-"),
        taskId: task.id,
        repository: task.repository,
        baseBranch: task.baseBranch,
        workflow: task.workflow,
        deploymentProfile: task.deploymentProfile,
        sandboxProfile: task.sandboxProfile,
      });
      await this.provider.updateStatus(task.id, "Running", task.id);
    }
  }
}
