import { describe, expect, it } from "vitest";
import { ProjectReconciler } from "../../src/tasks/reconciler.js";

describe("ProjectReconciler", () => {
  it("starts one Temporal workflow per ready project item with assurance plan metadata", async () => {
    const started: Array<Record<string, unknown>> = [];
    const statuses: string[] = [];
    const reconciler = new ProjectReconciler(
      {
        listReady: async () => [{
          id: "item-1",
          projectId: "project",
          projectItemId: "item-1",
          title: "Fix button spacing",
          description: "Adjust padding in the settings panel component",
          repository: "org/a",
          baseBranch: "main",
          workflow: "feature",
          deploymentProfile: "staging",
          sandboxProfile: "crabbox",
        }],
        updateStatus: async (_id, status) => { statuses.push(status); },
      },
      { start: async (input) => { started.push({ ...input }); } },
    );
    await reconciler.reconcile();
    expect(started).toHaveLength(1);
    expect(started[0]?.taskId).toBe("item-1");
    expect(started[0]?.policyVersion).toBe("policy.v1");
    expect(started[0]?.riskTier).toBe("T1");
    expect(started[0]?.assurancePlanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(statuses).toEqual(["Running"]);
  });
});
