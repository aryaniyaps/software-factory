export interface FactoryTask {
  id: string;
  projectId: string;
  projectItemId: string;
  title: string;
  description: string;
  repository: string;
  baseBranch: string;
  workflow: string;
  deploymentProfile: string;
  sandboxProfile: string;
}

export interface TaskProvider {
  listReady(): Promise<FactoryTask[]>;
  get(id: string): Promise<FactoryTask | null>;
  updateStatus(taskId: string, status: string, runId?: string): Promise<void>;
}
