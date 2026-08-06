import { describe, expect, it } from "vitest";
import { McpSecurityGateway, loadGatewayPolicyFromAllowlist } from "../../src/agents/mcp-gateway.js";

describe("AGT MCP security gateway", () => {
  it("denies tools not on the role allowlist", () => {
    const gateway = loadGatewayPolicyFromAllowlist(["read", "context7_query_docs"]);
    expect(gateway.isAllowed("read")).toBe(true);
    expect(gateway.isAllowed("write")).toBe(false);
    expect(() => gateway.assertAllowed("write")).toThrow("MCP gateway denied tool: write");
  });

  it("records audit entries for each decision", () => {
    const gateway = new McpSecurityGateway({ allow: ["get_evidence"] });
    gateway.isAllowed("get_evidence");
    gateway.isAllowed("bash");
    const log = gateway.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ tool: "get_evidence", allowed: true });
    expect(log[1]).toMatchObject({ tool: "bash", allowed: false });
  });
});
