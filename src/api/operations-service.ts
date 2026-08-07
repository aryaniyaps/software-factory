import type { FactoryNodeName } from "../contracts/nodes.js";
import type { WorkflowClientLike } from "../temporal/client.js";
import type { OperationResponse } from "./evidence-schemas.js";
import type { ClarificationAnswer } from "../contracts/clarification.js";

export interface OperationsService {
  cancelRun(runId: string): Promise<OperationResponse>;
  rerunNode(runId: string, node: FactoryNodeName): Promise<OperationResponse>;
  rollbackRelease(runId: string): Promise<OperationResponse>;
  answerClarification(runId: string, answer: ClarificationAnswer): Promise<OperationResponse>;
}

export function createOperationsService(input: {
  workflowClient: WorkflowClientLike;
}): OperationsService {
  const signal = async (runId: string, name: string, ...args: unknown[]): Promise<OperationResponse> => {
    if (!input.workflowClient.workflow.getHandle) {
      throw new Error(`unsupported operation for run ${runId}`);
    }
    await input.workflowClient.workflow.getHandle(`factory-${runId}`).signal(name, ...args);
    return {
      schemaVersion: "operation.v1",
      operation: name,
      runId,
      status: "signaled",
    };
  };

  return {
    cancelRun: (runId) => signal(runId, "cancelFactory"),
    rerunNode: (runId, node) => signal(runId, "rerunNode", node),
    rollbackRelease: (runId) => signal(runId, "rollbackRelease"),
    async answerClarification(runId, answer) {
      const handle = input.workflowClient.workflow.getHandle?.(`factory-${runId}`);
      if (!handle) throw new Error(`unsupported operation for run ${runId}`);
      if (handle.query) {
        const state = await handle.query<{
          pendingClarification?: { requestId: string; stateRevision: number };
        }>("factoryStatus");
        if (
          state.pendingClarification?.requestId !== answer.requestId
          || state.pendingClarification.stateRevision !== answer.stateRevision
        ) {
          throw new Error("clarification is no longer pending or the state revision is stale");
        }
      }
      await handle.signal("answerClarification", answer);
      return {
        schemaVersion: "operation.v1",
        operation: "answerClarification",
        runId,
        status: "signaled",
      };
    },
  };
}
