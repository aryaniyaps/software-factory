import { randomUUID } from "node:crypto";
import type { FactoryNodeName } from "../contracts/nodes.js";
import type { ClarificationAnswer } from "../contracts/clarification.js";
import type { FactoryExecutionViewV2 } from "../contracts/execution.js";
import type { ObjectStore } from "../evidence/object-store.js";
import {
  startFactoryExecution,
  type FactoryWorkflowInput,
  type WorkflowClientLike,
} from "../temporal/client.js";

export interface CreateExecutionInput {
  repository: string;
  title: string;
  description: string;
}

export type ExecutionCommand =
  | { type: "cancel" }
  | { type: "rerun_node"; node: FactoryNodeName }
  | { type: "rollback" }
  | { type: "answer_clarification"; answer: ClarificationAnswer };

export interface ExecutionsService {
  createExecution(input: CreateExecutionInput): Promise<{ workflowId: string; runId: string }>;
  listExecutions(): Promise<FactoryExecutionViewV2[]>;
  getExecution(workflowId: string): Promise<FactoryExecutionViewV2 | null>;
  command(workflowId: string, command: ExecutionCommand): Promise<void>;
  getObject(workflowId: string, objectId: string): Promise<Buffer>;
}

export function createExecutionsService(input: {
  workflowClient: WorkflowClientLike;
  objectStore: ObjectStore;
  id?: () => string;
}): ExecutionsService {
  const nextId = input.id ?? randomUUID;

  const getExecution = async (workflowId: string): Promise<FactoryExecutionViewV2 | null> => {
    const handle = input.workflowClient.workflow.getHandle?.(workflowId);
    if (!handle?.query) throw new Error("Temporal Workflow Query is unavailable");
    try {
      return await handle.query<FactoryExecutionViewV2>("factoryExecutionView");
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  };

  return {
    async createExecution(task) {
      const runId = nextId();
      const workflowId = `factory-${runId}`;
      const workflow: FactoryWorkflowInput = {
        runId,
        taskId: runId,
        repository: task.repository,
        baseBranch: "main",
        workflow: "feature",
        deploymentProfile: "staging",
        sandboxProfile: "crabbox",
        organization: process.env.FACTORY_ORGANIZATION,
        project: process.env.FACTORY_PROJECT,
        title: task.title,
        description: task.description,
        protocolVersion: 3,
        skipBuildRelease:
          process.env.FACTORY_SKIP_RELEASE === "true" || !process.env.FACTORY_PREVIOUS_DIGEST,
      };
      await startFactoryExecution(input.workflowClient, workflow);
      return { workflowId, runId };
    },

    async listExecutions() {
      const list = input.workflowClient.workflow.list;
      if (!list) throw new Error("Temporal Workflow Visibility is unavailable");
      const views: FactoryExecutionViewV2[] = [];
      for await (const execution of list({
        query: 'FactoryExecutionContract="factory-execution-view.v2"',
      })) {
        const view = await getExecution(execution.workflowId);
        if (view) views.push(view);
      }
      return views;
    },

    getExecution,

    async command(workflowId, command) {
      const handle = input.workflowClient.workflow.getHandle?.(workflowId);
      if (!handle) throw new Error("Temporal Workflow handle is unavailable");
      if (command.type === "cancel") await handle.signal("cancelFactory");
      else if (command.type === "rerun_node") {
        const view = await getExecution(workflowId);
        if (!view) throw new Error("execution not found");
        if (!view.graph.nodes.some((node) => node.id === command.node)) {
          throw new Error(`node ${command.node} is not in this execution graph`);
        }
        await handle.signal("rerunNode", command.node);
      }
      else if (command.type === "rollback") await handle.signal("rollbackRelease");
      else await handle.signal("answerClarification", command.answer);
    },

    async getObject(workflowId, objectId) {
      const view = await getExecution(workflowId);
      if (!view) throw new Error("execution not found");
      const referenced = new Set<string>();
      for (const turn of view.turns) referenced.add(turn.transcript.objectId);
      for (const call of view.toolCalls) {
        referenced.add(call.input.objectId);
        if (call.output) referenced.add(call.output.objectId);
      }
      if (!referenced.has(objectId)) throw new Error("object is not referenced by this execution");
      return input.objectStore.get(objectId);
    },
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /not found|notfound/i.test(`${error.name} ${error.message}`);
}
