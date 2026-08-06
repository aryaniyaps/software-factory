import { describe, expect, it } from "vitest";
import { AgentRoles } from "../../src/contracts/nodes.js";
import { ROLE_PROFILES } from "../../src/agents/role-profiles.js";
import { toolsForRole } from "../../src/agents/tool-policy.js";
import { createPiWebAccessConfig } from "../../src/integrations/pi-web-access.js";
import { memoryTags } from "../../src/integrations/hindsight-config.js";

describe("agent platform role matrix", () => {
  it("keeps role capabilities distinct while sharing only factory resources", async () => {
    const roles = AgentRoles.map((role) => ({ role, profile: ROLE_PROFILES[role], tools: toolsForRole(role) }));
    expect(roles).toHaveLength(6);
    const critic = roles.find(({ role }) => role === "maintainability_critic");
    expect(critic?.tools).not.toContain("write");
    expect(critic?.tools).not.toContain("bash");
    expect(new Set(roles.map(({ tools }) => tools.join(","))).size).toBeGreaterThan(1);
    expect(createPiWebAccessConfig({}).provider).toBe("all");
    expect(memoryTags({ factoryRunId: "run", ticketId: "task", attemptId: "1", phaseId: "plan", agentRole: "plan", organization: "acme", project: "platform", repository: "acme/platform" })).toEqual(expect.arrayContaining(["org:acme", "project:platform", "repository:acme/platform"]));
  });
});
