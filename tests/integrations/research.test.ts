import { beforeEach, describe, expect, it, vi } from "vitest";
import { Context7Client, formatCallToolResult } from "../../src/integrations/research.js";

const { callTool, clientClose, connect, transportClose } = vi.hoisted(() => ({
  callTool: vi.fn(),
  clientClose: vi.fn(),
  connect: vi.fn(),
  transportClose: vi.fn(),
}));

vi.mock("@modelcontextprotocol/client", () => ({
  Client: class {
    connect = connect;
    callTool = callTool;
    close = clientClose;
  },
  StreamableHTTPClientTransport: class {
    close = transportClose;
  },
}));

describe("formatCallToolResult", () => {
  it("joins text content blocks", () => {
    expect(formatCallToolResult({ content: [{ type: "text", text: "line one" }, { type: "text", text: "line two" }] })).toBe("line one\nline two");
  });

  it("serializes structured content objects", () => {
    expect(formatCallToolResult({ content: [], structuredContent: { libraryId: "/org/react" } })).toBe('{"libraryId":"/org/react"}');
  });

  it("returns structured content strings directly", () => {
    expect(formatCallToolResult({ content: [], structuredContent: "/org/react" })).toBe("/org/react");
  });

  it("throws when the tool reports an error", () => {
    expect(() => formatCallToolResult({ isError: true, content: [{ type: "text", text: "library not found" }] })).toThrow("library not found");
  });
});

describe("Context7Client", () => {
  beforeEach(() => {
    callTool.mockReset();
    connect.mockReset();
    clientClose.mockReset();
    transportClose.mockReset();
  });

  it("resolves a library id and queries docs through MCP tools", async () => {
    callTool
      .mockResolvedValueOnce({ content: [{ type: "text", text: "/org/react" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "hook docs" }] });

    const client = new Context7Client("https://mcp.context7.com/mcp", "test-key");
    await expect(client.call({ library: "react", query: "useEffect" })).resolves.toBe("hook docs");

    expect(connect).toHaveBeenCalledTimes(2);
    expect(callTool).toHaveBeenNthCalledWith(1, {
      name: "resolve-library-id",
      arguments: { libraryName: "react" },
    });
    expect(callTool).toHaveBeenNthCalledWith(2, {
      name: "query-docs",
      arguments: { libraryId: "/org/react", query: "useEffect" },
    });
    expect(clientClose).toHaveBeenCalledTimes(2);
    expect(transportClose).toHaveBeenCalledTimes(2);
  });
});
