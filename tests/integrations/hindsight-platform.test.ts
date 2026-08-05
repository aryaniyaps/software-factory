import { describe, expect, it, vi } from "vitest";
import { HindsightMemory } from "../../src/integrations/hindsight.js";
import { memoryTags, projectBankId } from "../../src/integrations/hindsight-config.js";

describe("Hindsight project memory", () => {
  it("derives stable project banks and complete correlation tags", () => {
    const context = { factoryRunId: "run", initiativeId: "project-x", ticketId: "ticket", attemptId: "1", phaseId: "plan", agentRole: "planner", worktreeId: "wt", organization: "Acme", project: "Platform", repository: "acme/platform" };
    expect(projectBankId("Acme", "Platform")).toBe("acme-platform");
    expect(memoryTags(context)).toEqual(expect.arrayContaining(["org:acme", "project:platform", "repository:acme/platform", "run:run", "role:planner", "phase:plan"]));
  });

  it("bootstraps templates and retrieves tagged mental models", async () => {
    const client = {
      retainBatch: vi.fn().mockResolvedValue(undefined), recall: vi.fn().mockResolvedValue([]), reflect: vi.fn().mockResolvedValue("insight"),
      importTemplate: vi.fn().mockResolvedValue({ operation_id: "op-1" }), getMentalModel: vi.fn().mockResolvedValue({ content: "model" }),
    };
    const memory = new HindsightMemory(client);
    const context = { factoryRunId: "run", initiativeId: "project", ticketId: "ticket", attemptId: "1", phaseId: "plan", agentRole: "planner", organization: "acme", project: "platform", repository: "acme/platform" };
    await expect(memory.bootstrapBank("acme-platform", { version: "1", bank: { retain_mission: "retain decisions", observations_mission: "find patterns", reflect_mission: "advise", directives: ["cite evidence"] }, mental_models: [] })).resolves.toEqual("op-1");
    await expect(memory.getMentalModel("acme-platform", "architecture", context)).resolves.toEqual({ content: "model" });
    expect(client.getMentalModel).toHaveBeenCalledWith("acme-platform", "architecture", { tags: expect.arrayContaining(["project:platform"]) });
  });
});
