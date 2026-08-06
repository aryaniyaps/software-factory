import { describe, expect, it } from "vitest";
import { createProductionWorkers } from "../../src/temporal/worker-main.js";
import { TASK_QUEUES } from "../../src/temporal/task-queues.js";

describe("production Temporal workers", () => {
  it("registers one worker per execution queue", async () => {
    const queues: string[] = [];
    const workers = await createProductionWorkers({
      workflowsPath: "/factory/workflows.js",
      activities: {},
      createWorker: async (options) => { queues.push(options.taskQueue ?? ""); return { run: async () => {} }; },
    });
    expect(queues).toEqual([TASK_QUEUES.control, TASK_QUEUES.agent, TASK_QUEUES.build, TASK_QUEUES.deploy, TASK_QUEUES.verifier]);
    expect(workers).toHaveLength(5);
  });

  it("scopes activities to dedicated queues while leaving control as the default host", async () => {
    const { activitiesForQueue } = await import("../../src/temporal/worker-main.js");
    const activities = {
      prepareRepository: async () => ({}),
      runAgent: async () => ({}),
      runChecks: async () => ({}),
      deploy: async () => ({}),
      runBehavioralVerification: async () => ({}),
    };
    expect(Object.keys(activitiesForQueue(TASK_QUEUES.agent, activities))).toEqual(["runAgent"]);
    expect(Object.keys(activitiesForQueue(TASK_QUEUES.control, activities))).toEqual(["prepareRepository"]);
  });
});
