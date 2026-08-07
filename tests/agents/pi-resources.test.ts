import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertRequiredSkills, factoryResourceRoot } from "../../src/agents/pi-resources.js";

describe("factory Pi resources", () => {
  it("declares required packages and filesystem skills", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../infra/pi/resource-manifest.json", import.meta.url), "utf8")) as { packages: Array<{ name: string }>; skillsRoot: string; requiredSkills: string[]; webSearchConfig: string };
    expect(manifest.packages.map((pkg) => pkg.name)).toEqual(expect.arrayContaining(["pi-web-access", "@dietrichgebert/ponytail", "context-mode", "@tintinweb/pi-subagents"]));
    expect(manifest.skillsRoot).toBe("src/agents/skills");
    expect(manifest.requiredSkills).toContain("src/agents/skills/engineering/tdd/SKILL.md");
    expect(manifest.requiredSkills).toContain("src/agents/skills/impeccable/SKILL.md");
    expect(manifest.webSearchConfig).toBe("infra/pi/web-search.json.example");
  });

  it("rejects missing skills and resolves a factory-owned root", async () => {
    await expect(assertRequiredSkills("/missing", ["src/agents/skills/engineering/tdd/SKILL.md"])).rejects.toThrow("missing factory skill");
    expect(factoryResourceRoot({ PI_RESOURCE_ROOT: "/factory/pi-resources" })).toBe("/factory/pi-resources");
  });
});
