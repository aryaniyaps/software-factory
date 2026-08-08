import { describe, expect, it } from "vitest";
import { memoryQueryFromAgentValue } from "../../src/agents/memory.js";

describe("memoryQueryFromAgentValue", () => {
  it("builds a compact recall query from node context", () => {
    const query = memoryQueryFromAgentValue("discovery_plan", {
      task: {
        prompt: "add support for dynamically fetching books for isbn autocomplete",
        repository: "https://github.com/aryaniyaps/go-book-store.git",
      },
      clarification: {
        request: { question: "Which data source should implement ISBN autocomplete?" },
        answer: { body: "dynamically called external book api" },
      },
      predecessors: [{ role: "scout", status: "succeeded", summary: "Repo uses gqlgen and postgres." }],
    });
    expect(query).toContain("role=discovery_plan");
    expect(query).toContain("answer=dynamically called external book api");
    expect(query.length).toBeLessThan(1_800);
  });
});
