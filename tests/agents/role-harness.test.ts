import { describe, expect, it } from "vitest";
import {
  allToolsForRole,
  canEscalateToHuman,
  harnessForRole,
  ROLE_HARNESS_SPECS,
} from "../../src/agents/role-harness.js";
import { AgentRoles } from "../../src/contracts/nodes.js";
import { McpSecurityGateway } from "../../src/agents/mcp-gateway.js";

describe("RoleHarnessSpec", () => {
  it("defines a harness for every agent role", () => {
    for (const role of AgentRoles) {
      expect(ROLE_HARNESS_SPECS[role]).toBeDefined();
      expect(harnessForRole(role).role).toBe(role);
    }
  });

  it("uses allowlist-only tool registration semantics", () => {
    expect(allToolsForRole("scout")).toEqual([
      "read", "grep", "find", "ls", "web_search", "resolve-library-id", "query-docs",
    ]);
    expect(allToolsForRole("implement")).not.toContain("web_search");
    expect(allToolsForRole("review")).toEqual(expect.arrayContaining([
      "get_evidence", "list_evidence_meta",
    ]));
    expect(allToolsForRole("maintainability_critic")).not.toContain("list_evidence_meta");
  });

  it("scopes factory-evidence MCP to review and critic", () => {
    expect(harnessForRole("review").mcpServers.map((s) => s.id)).toContain("factory-evidence");
    expect(harnessForRole("maintainability_critic").mcpServers.map((s) => s.id)).toContain("factory-evidence");
    expect(harnessForRole("scout").mcpServers.map((s) => s.id)).not.toContain("factory-evidence");
  });

  it("allows escalate_to_human only on selected roles", () => {
    expect(canEscalateToHuman("plan")).toBe(true);
    expect(canEscalateToHuman("repair")).toBe(true);
    expect(canEscalateToHuman("implement")).toBe(false);
  });

  it("denies tools outside the gateway allowlist", () => {
    const gateway = new McpSecurityGateway({ allow: ["read", "get_evidence"] });
    expect(gateway.isAllowed("read")).toBe(true);
    expect(gateway.isAllowed("write")).toBe(false);
  });
});
