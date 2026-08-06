import { Client, StreamableHTTPClientTransport, type CallToolResult } from "@modelcontextprotocol/client";
import type { Context7ToolClient } from "../agents/tools.js";

export interface Context7McpConfig {
  endpoint?: string;
  apiKey?: string;
}

export function formatCallToolResult(result: CallToolResult): string {
  if (result.isError) {
    const message = (result.content ?? [])
      .map((block) => ("text" in block ? block.text : ""))
      .filter(Boolean)
      .join("\n");
    throw new Error(message || "Context7 tool call failed");
  }
  if (result.structuredContent !== undefined) {
    return typeof result.structuredContent === "string"
      ? result.structuredContent
      : JSON.stringify(result.structuredContent);
  }
  const text = (result.content ?? [])
    .map((block) => ("text" in block ? block.text : ""))
    .filter(Boolean)
    .join("\n");
  if (!text) return JSON.stringify(result);
  return text;
}

async function withMcpClient<T>(
  endpoint: string,
  apiKey: string | undefined,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "software-factory", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    ...(apiKey ? { authProvider: { token: async () => apiKey } } : {}),
  });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await transport.close();
  }
}

export class Context7McpClient {
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;

  constructor(config: Context7McpConfig = {}) {
    this.endpoint = config.endpoint ?? process.env.CONTEXT7_MCP_URL ?? "https://mcp.context7.com/mcp";
    this.apiKey = config.apiKey ?? process.env.CONTEXT7_API_KEY;
  }

  async resolveLibraryId(libraryName: string): Promise<string> {
    return withMcpClient(this.endpoint, this.apiKey, async (client) => {
      const resolved = await client.callTool({ name: "resolve-library-id", arguments: { libraryName } });
      return formatCallToolResult(resolved);
    });
  }

  async queryDocs(libraryId: string, query: string): Promise<string> {
    return withMcpClient(this.endpoint, this.apiKey, async (client) => {
      const docs = await client.callTool({ name: "query-docs", arguments: { libraryId, query } });
      return formatCallToolResult(docs);
    });
  }
}

export class Context7Client implements Context7ToolClient {
  private readonly mcp = new Context7McpClient();

  async call(input: { library: string; query: string }): Promise<string> {
    const libraryId = await this.mcp.resolveLibraryId(input.library);
    return this.mcp.queryDocs(libraryId, input.query);
  }
}
