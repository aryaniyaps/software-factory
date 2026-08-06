import { Client, Connection } from "@temporalio/client";
import { TASK_QUEUES } from "./task-queues.js";

export { TASK_QUEUES };

export interface FactoryWorkflowInput {
  runId: string;
  taskId: string;
  repository: string;
  baseBranch: string;
  workflow: string;
  deploymentProfile: string;
  sandboxProfile: string;
  title?: string;
  description?: string;
  policyVersion?: string;
  riskTier?: string;
  assurancePlanHash?: string;
  attemptId?: string;
  organization?: string;
  project?: string;
}

export interface WorkflowHandleLike {
  signal(name: string, ...args: unknown[]): Promise<void>;
}

export interface WorkflowClientLike {
  workflow: {
    start(workflow: unknown, options: { workflowId: string; taskQueue: string; args: [FactoryWorkflowInput] }): Promise<unknown>;
    getHandle?(workflowId: string): WorkflowHandleLike;
  };
}

export async function startFactoryWorkflow(client: WorkflowClientLike, input: FactoryWorkflowInput): Promise<unknown> {
  return client.workflow.start("factoryWorkflow", {
    workflowId: `factory-${input.runId}`,
    taskQueue: TASK_QUEUES.control,
    args: [input],
  });
}

export class TemporalWorkflowStarter {
  constructor(private readonly client: WorkflowClientLike) {}

  start(input: FactoryWorkflowInput): Promise<unknown> {
    return startFactoryWorkflow(this.client, input);
  }
}

export async function createTemporalClient(options: { address?: string; namespace?: string } = {}): Promise<Client> {
  const connection: Connection = await Connection.connect({ address: options.address ?? process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  return new Client({ connection, namespace: options.namespace ?? process.env.TEMPORAL_NAMESPACE ?? "default" });
}
