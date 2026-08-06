import { describe, expect, it } from "vitest";
import { ROLE_PROFILES } from "../../src/agents/role-profiles.js";
import { createPiWebAccessConfig } from "../../src/integrations/pi-web-access.js";
import { memoryTags } from "../../src/integrations/hindsight-config.js";

describe("agent platform role matrix", () => {
  it("keeps role capabilities distinct while sharing only factory resources", async () => {
    const roles = await Promise.all(Object.keys(ROLE_PROFILES).map(async (role) => ({ role, profile: ROLE_PROFILES[role] })));
    expect(roles).toHaveLength(6);
    const critic = roles.find(({ role }) => role === "maintainability_critic");
    expect(critic?.profile.tools).not.toContain("write");
    expect(critic?.profile.tools).not.toContain("bash");
    expect(new Set(roles.map(({ profile }) => profile.tools.join(","))).size).toBeGreaterThan(1);
    expect(createPiWebAccessConfig({}).provider).toBe("all");
    expect(memoryTags({ factoryRunId: "run", ticketId: "task", attemptId: "1", phaseId: "plan", agentRole: "plan", organization: "acme", project: "platform", repository: "acme/platform" })).toEqual(expect.arrayContaining(["org:acme", "project:platform", "repository:acme/platform"]));
  });
});
