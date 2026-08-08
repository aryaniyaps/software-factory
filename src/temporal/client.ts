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
  protocolVersion?: 2;
  /** Skip container build and release when local deploy prerequisites are absent. */
  skipBuildRelease?: boolean;
}

export interface WorkflowHandleLike {
  signal(name: string, ...args: unknown[]): Promise<void>;
  query?<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
}

export interface WorkflowStartLikeOptions {
  workflowId: string;
  taskQueue: string;
  args: [FactoryWorkflowInput];
  searchAttributes?: Record<string, string[]>;
  memo?: Record<string, unknown>;
}

export interface WorkflowClientLike {
  workflow: {
    start(workflow: unknown, options: WorkflowStartLikeOptions): Promise<unknown>;
    getHandle?(workflowId: string): WorkflowHandleLike;
  };
}

function dashboardBaseUrl(): string {
  return (process.env.DASHBOARD_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

export async function startFactoryWorkflow(client: WorkflowClientLike, input: FactoryWorkflowInput): Promise<unknown> {
  return client.workflow.start("factoryWorkflow", {
    workflowId: `factory-${input.runId}`,
    taskQueue: TASK_QUEUES.control,
    args: [input],
  });
}

export async function startFactoryWorkflowV2(client: WorkflowClientLike, input: FactoryWorkflowInput): Promise<unknown> {
  const baseUrl = dashboardBaseUrl();
  return client.workflow.start("factoryWorkflow", {
    workflowId: `factory-${input.runId}`,
    taskQueue: TASK_QUEUES.control,
    args: [{ ...input, protocolVersion: 2 }],
    searchAttributes: {
      FactoryRepository: [input.repository],
      FactoryRunStatus: ["running"],
      FactoryWorkflowKind: [input.workflow],
      ...(input.riskTier ? { FactoryRiskTier: [input.riskTier] } : {}),
    },
    memo: {
      title: input.title,
      description: input.description,
      dashboardUrl: `${baseUrl}/runs/${input.runId}`,
    },
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
