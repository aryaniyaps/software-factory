import { describe, expect, it } from "vitest";
import { TASK_QUEUES } from "../../src/temporal/task-queues.js";

describe("Temporal task queues", () => {
  it("exposes dedicated control, agent, build, deploy, and verifier queues", () => {
    expect(TASK_QUEUES).toEqual({
      control: "factory-control",
      agent: "factory-agent",
      build: "factory-build",
      deploy: "factory-deploy",
      verifier: "factory-verifier",
    });
  });
});
