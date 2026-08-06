import type { FactoryNodeName } from "../contracts/nodes.js";
import type { WorkflowClientLike } from "../temporal/client.js";
import type { OperationResponse } from "./evidence-schemas.js";

export interface OperationsService {
  cancelRun(runId: string): Promise<OperationResponse>;
  rerunNode(runId: string, node: FactoryNodeName): Promise<OperationResponse>;
  rollbackRelease(runId: string): Promise<OperationResponse>;
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
  };
}
