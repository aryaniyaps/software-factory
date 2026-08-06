import { describe, expect, it } from "vitest";
import { profileForRole, roleLoaderOptions } from "../../src/agents/role-profiles.js";
import { toolsForRole } from "../../src/agents/tool-policy.js";

describe("Pi role profiles", () => {
  it("defines distinct capabilities for every workflow role", () => {
    expect(toolsForRole("scout")).toContain("web_search");
    expect(profileForRole("implement").skills).toContain("src/agents/skills/engineering/implement/SKILL.md");
    expect(profileForRole("repair").skills).toContain("src/agents/skills/engineering/diagnosing-bugs/SKILL.md");
    expect(profileForRole("review").skills).toContain("src/agents/skills/engineering/code-review/SKILL.md");
    expect(toolsForRole("maintainability_critic")).not.toContain("write");
    expect(toolsForRole("maintainability_critic")).not.toContain("edit");
    expect(profileForRole("plan").mentalModels).toContain("architecture");
    expect(() => profileForRole("unknown")).toThrow("unknown Pi role");
  });

  it("constructs role-specific loader paths under the factory root", () => {
    const options = roleLoaderOptions("review", "/factory/resources");
    expect(options.agentDir).toBe("/factory/resources");
    expect(options.additionalSkillPaths).toEqual(expect.arrayContaining(["/factory/resources/src/agents/skills/engineering/code-review/SKILL.md"]));
  });
});
