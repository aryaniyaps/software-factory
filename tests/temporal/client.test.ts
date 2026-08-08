import { describe, expect, it } from "vitest";
import {
  startFactoryWorkflow,
  startFactoryWorkflowV2,
  TASK_QUEUES,
  type FactoryWorkflowInput,
  type WorkflowClientLike,
} from "../../src/temporal/client.js";

function mockClient(onStart: WorkflowClientLike["workflow"]["start"]): WorkflowClientLike {
  return { workflow: { start: onStart } };
}

describe("Temporal factory client", () => {
  const input: FactoryWorkflowInput = {
    runId: "run-123",
    taskId: "project-item-9",
    repository: "org/service-a",
    baseBranch: "main",
    workflow: "feature",
    deploymentProfile: "staging",
    sandboxProfile: "gondolin-default",
    title: "Add feature X",
    description: "Acceptance criteria",
    riskTier: "medium",
  };

  it("starts a stable workflow on the control queue", async () => {
    let received: Record<string, unknown> | undefined;
    const client = mockClient(async (workflow, options) => {
      received = { workflow, ...options };
      return { workflowId: options.workflowId };
    });

    await startFactoryWorkflow(client, input);
    expect(received).toMatchObject({
      workflowId: "factory-run-123",
      taskQueue: TASK_QUEUES.control,
      args: [input],
    });
  });

  it("starts v2 with search attributes and dashboard memo", async () => {
    let received: Record<string, unknown> | undefined;
    const client = mockClient(async (workflow, options) => {
      received = { workflow, ...options };
      return { workflowId: options.workflowId };
    });
    const previous = process.env.DASHBOARD_BASE_URL;
    process.env.DASHBOARD_BASE_URL = "http://dashboard.test";

    try {
      await startFactoryWorkflowV2(client, input);
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_BASE_URL;
      else process.env.DASHBOARD_BASE_URL = previous;
    }

    expect(received).toMatchObject({
      workflowId: "factory-run-123",
      taskQueue: TASK_QUEUES.control,
      args: [{ ...input, protocolVersion: 2 }],
      searchAttributes: {
        FactoryRepository: ["org/service-a"],
        FactoryRunStatus: ["running"],
        FactoryWorkflowKind: ["feature"],
        FactoryRiskTier: ["medium"],
      },
      memo: {
        title: "Add feature X",
        description: "Acceptance criteria",
        dashboardUrl: "http://dashboard.test/runs/run-123",
      },
    });
  });
});
