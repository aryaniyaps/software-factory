import type { Context7ToolClient, WebSearchToolClient } from "../agents/tools.js";

async function jsonRpc(url: string, body: unknown, apiKey?: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`research request failed: ${response.status}`);
  const text = await response.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
  return JSON.parse(dataLine ? dataLine.slice(5).trim() : text);
}

export class Context7Client implements Context7ToolClient {
  constructor(private readonly endpoint = process.env.CONTEXT7_MCP_URL ?? "https://mcp.context7.com/mcp", private readonly apiKey = process.env.CONTEXT7_API_KEY) {}

  async call(input: { library: string; query: string }): Promise<string> {
    const resolved = await jsonRpc(this.endpoint, {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "resolve-library-id", arguments: { libraryName: input.library } },
    }, this.apiKey);
    const libraryId = JSON.stringify(resolved);
    const docs = await jsonRpc(this.endpoint, {
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "query-docs", arguments: { libraryId, query: input.query } },
    }, this.apiKey);
    return JSON.stringify(docs);
  }
}

export class WebSearchClient implements WebSearchToolClient {
  constructor(private readonly endpoint = process.env.WEB_SEARCH_URL, private readonly apiKey = process.env.WEB_SEARCH_API_KEY) {}

  async search(query: string): Promise<string> {
    if (!this.endpoint) throw new Error("WEB_SEARCH_URL is required for the web_search tool");
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) throw new Error(`web search failed: ${response.status}`);
    return response.text();
  }
}
