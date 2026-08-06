import { describe, expect, it } from "vitest";
import {
  allToolNamesForHarness,
  harnessForRole,
  ROLE_HARNESS_SPECS,
  canEscalateToHuman,
} from "../../src/agents/role-harness-spec.js";
import { AgentRoles } from "../../src/contracts/nodes.js";

describe("RoleHarnessSpec", () => {
  it("defines a harness for every agent role", () => {
    for (const role of AgentRoles) {
      expect(ROLE_HARNESS_SPECS[role]).toBeDefined();
      expect(harnessForRole(role).role).toBe(role);
    }
  });

  it("uses allowlist-only tool registration semantics", () => {
    const scout = harnessForRole("scout");
    expect(allToolNamesForHarness(scout)).toEqual([
      "read", "grep", "find", "ls",
      "context7_resolve_library_id", "context7_query_docs",
      "web_search",
    ]);
    expect(allToolNamesForHarness(harnessForRole("implement"))).not.toContain("web_search");
    expect(allToolNamesForHarness(harnessForRole("review"))).toEqual(expect.arrayContaining([
      "get_evidence", "list_evidence_meta",
    ]));
    expect(allToolNamesForHarness(harnessForRole("maintainability_critic"))).not.toContain("list_evidence_meta");
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
});
