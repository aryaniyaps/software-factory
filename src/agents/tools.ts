import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

export interface Context7ToolClient {
  call(input: { library: string; query: string }): Promise<string>;
}

export interface WebSearchToolClient {
  search(query: string): Promise<string>;
}

export function createContext7Tool(client: Context7ToolClient) {
  return defineTool({
    name: "context7",
    label: "Context7",
    description: "Look up current library and framework documentation through Context7.",
    parameters: Type.Object({ library: Type.String(), query: Type.String() }),
    execute: async (_id, input) => ({ content: [{ type: "text", text: await client.call(input) }], details: {} }),
  });
}

export function createWebSearchTool(client: WebSearchToolClient) {
  return defineTool({
    name: "web_search",
    label: "Web Search",
    description: "Search configured web sources for current technical information.",
    parameters: Type.Object({ query: Type.String() }),
    execute: async (_id, input) => ({ content: [{ type: "text", text: await client.search(input.query) }], details: {} }),
  });
}
