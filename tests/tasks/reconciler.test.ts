import { describe, expect, it } from "vitest";
import { ProjectReconciler } from "../../src/tasks/reconciler.js";

describe("ProjectReconciler", () => {
  it("starts one Temporal workflow per ready project item", async () => {
    const started: string[] = [];
    const statuses: string[] = [];
    const reconciler = new ProjectReconciler(
      { listReady: async () => [{ id: "item-1", projectId: "project", projectItemId: "item-1", title: "A", description: "A", repository: "org/a", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "gondolin" }], updateStatus: async (_id, status) => { statuses.push(status); } },
      { start: async (input) => { started.push(input.taskId); } },
    );
    await reconciler.reconcile();
    expect(started).toEqual(["item-1"]);
    expect(statuses).toEqual(["Running"]);
  });
});
