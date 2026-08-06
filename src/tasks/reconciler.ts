import type { FactoryTask, TaskProvider } from "./task-provider.js";
import { buildAssurancePlan } from "../policy/policy-loader.js";

export interface WorkflowStartInput {
  runId: string;
  taskId: string;
  repository: string;
  baseBranch: string;
  workflow: string;
  deploymentProfile: string;
  sandboxProfile: string;
  title: string;
  description: string;
  policyVersion: string;
  riskTier: string;
  assurancePlanHash: string;
}

export interface WorkflowStarter {
  start(input: WorkflowStartInput): Promise<unknown>;
}

export class ProjectReconciler {
  constructor(private readonly provider: TaskProvider, private readonly workflows: WorkflowStarter) {}

  async reconcile(): Promise<void> {
    for (const task of await this.provider.listReady()) {
      const plan = buildAssurancePlan({
        title: task.title,
        description: task.description,
        workflow: task.workflow,
        repository: task.repository,
      });

      await this.workflows.start({
        runId: task.id.replace(/[^a-zA-Z0-9_-]+/g, "-"),
        taskId: task.id,
        repository: task.repository,
        baseBranch: task.baseBranch,
        workflow: task.workflow,
        deploymentProfile: task.deploymentProfile,
        sandboxProfile: task.sandboxProfile,
        title: task.title,
        description: task.description,
        policyVersion: plan.policyVersion,
        riskTier: plan.classification.riskTier,
        assurancePlanHash: plan.planHash,
      });
      await this.provider.updateStatus(task.id, "Running", task.id);
    }
  }
}
