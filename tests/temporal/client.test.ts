import { describe, expect, it } from "vitest";
import { startFactoryWorkflow, TASK_QUEUES, type FactoryWorkflowInput } from "../../src/temporal/client.js";

describe("Temporal factory client", () => {
  it("starts a stable workflow on the control queue", async () => {
    let received: Record<string, unknown> | undefined;
    const client = {
      workflow: {
        start: async (workflow: unknown, options: Record<string, unknown>) => {
          received = { workflow, ...options };
          return { workflowId: options.workflowId };
        },
      },
    };
    const input: FactoryWorkflowInput = {
      runId: "run-123",
      taskId: "project-item-9",
      repository: "org/service-a",
      baseBranch: "main",
      workflow: "feature",
      deploymentProfile: "staging",
      sandboxProfile: "gondolin-default",
    };

    await startFactoryWorkflow(client, input);
    expect(received).toMatchObject({
      workflowId: "factory-run-123",
      taskQueue: TASK_QUEUES.control,
      args: [input],
    });
  });
});
