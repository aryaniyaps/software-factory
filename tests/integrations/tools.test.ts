import { describe, expect, it } from "vitest";
import { createContext7Tool, createWebSearchTool } from "../../src/agents/tools.js";

describe("agent research tools", () => {
  it("exposes Context7 and web search as named tools", () => {
    expect(createContext7Tool({ call: async () => "docs" }).name).toBe("context7");
    expect(createWebSearchTool({ search: async () => "results" }).name).toBe("web_search");
  });
});
