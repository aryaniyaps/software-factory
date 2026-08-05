import { describe, expect, it, vi } from "vitest";
import { HindsightMemory } from "../../src/integrations/hindsight.js";

describe("HindsightMemory", () => {
  it("uses the scoped bank and correlation document id", async () => {
    const retainBatch = vi.fn().mockResolvedValue(undefined);
    const recall = vi.fn().mockResolvedValue([{ text: "remembered" }]);
    const reflect = vi.fn().mockResolvedValue("insight");
    const memory = new HindsightMemory({ retainBatch, recall, reflect });
    const context = { factoryRunId: "run-1", ticketId: "ticket-1", attemptId: "attempt-1", phaseId: "scout" };

    await memory.retain("project:demo", "Use strict TypeScript", context);
    expect(retainBatch).toHaveBeenCalledWith("project:demo", [{ content: "Use strict TypeScript", document_id: "run-1:ticket-1:attempt-1:scout", tags: ["run:run-1", "phase:scout"] }], { async: true });
    await expect(memory.recall("project:demo", "TypeScript", context)).resolves.toEqual([{ text: "remembered" }]);
    await expect(memory.reflect("project:demo", "What matters?", context)).resolves.toBe("insight");
  });
});
