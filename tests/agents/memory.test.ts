import { describe, expect, it, vi } from "vitest";
import { assembleAgentMemory } from "../../src/agents/memory.js";

describe("agent memory assembly", () => {
  it("skips reflect when the role policy does not allow it", async () => {
    const reflectProject = vi.fn();
    const context = await assembleAgentMemory({
      recallProject: vi.fn().mockResolvedValue([]),
      reflectProject,
      getMentalModelForProject: vi.fn().mockResolvedValue(null),
    }, {
      bank: "acme-platform",
      role: "implement",
      query: "{}",
      mentalModels: ["repository-conventions"],
      tags: ["project:platform"],
      operations: ["recall", "retain"],
    });
    expect(context).toContain("Recall:");
    expect(context).not.toContain("Reflection:");
    expect(reflectProject).not.toHaveBeenCalled();
  });
});
