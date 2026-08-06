import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { formatCallToolResult } from "../integrations/research.js";

async function withContext7Client<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const endpoint = process.env.CONTEXT7_MCP_URL ?? "https://mcp.context7.com/mcp";
  const apiKey = process.env.CONTEXT7_API_KEY;
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

export function createContext7McpTools() {
  return [
    defineTool({
      name: "resolve-library-id",
      label: "Context7 resolve library",
      description: "Resolve a library name to a Context7 library id.",
      parameters: Type.Object({ libraryName: Type.String() }),
      execute: async (_id, input) => {
        const text = await withContext7Client(async (c) => formatCallToolResult(await c.callTool({
          name: "resolve-library-id",
          arguments: { libraryName: input.libraryName },
        })));
        return { content: [{ type: "text", text }], details: {} };
      },
    }),
    defineTool({
      name: "query-docs",
      label: "Context7 query docs",
      description: "Query documentation for a resolved Context7 library id.",
      parameters: Type.Object({ libraryId: Type.String(), query: Type.String() }),
      execute: async (_id, input) => {
        const text = await withContext7Client(async (c) => formatCallToolResult(await c.callTool({
          name: "query-docs",
          arguments: { libraryId: input.libraryId, query: input.query },
        })));
        return { content: [{ type: "text", text }], details: {} };
      },
    }),
  ];
}
