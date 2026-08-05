import { describe, expect, it } from "vitest";
import { runConcurrentTasks } from "./helpers/temporal-harness.js";

const task = (id: string, repository: string) => ({
  id, projectId: "project", projectItemId: id, title: id, description: id,
  repository, baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "gondolin",
});

describe("production loop", () => {
  it("starts two repository tasks concurrently with stable task identities", async () => {
    await expect(runConcurrentTasks([task("task-a", "org/a"), task("task-b", "org/b")])).resolves.toEqual(["task-a", "task-b"]);
  });
});
