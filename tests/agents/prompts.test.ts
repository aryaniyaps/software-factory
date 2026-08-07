import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptForRole } from "../../src/agents/prompts.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("promptForRole", () => {
  it("prefers bootstrapped PI_RESOURCE_ROOT system prompts over legacy stubs", () => {
    const root = mkdtempSync(join(tmpdir(), "sf-pi-resources-"));
    const promptDir = join(root, "roles", "scout", "prompts");
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(join(promptDir, "system.md"), "# Scout harness\n\n## Output contract (`agent-output.v1`)\n");
    process.env.PI_RESOURCE_ROOT = root;

    const prompt = promptForRole("scout", undefined, "/tmp/some-worktree");
    expect(prompt).toContain("agent-output.v1");
    expect(prompt).toContain("Scout harness");
  });

  it("falls back to infra/pi role prompts from the factory repo", () => {
    delete process.env.PI_RESOURCE_ROOT;
    const prompt = promptForRole("scout");
    expect(prompt).toContain("agent-output.v1");
    expect(prompt).toContain("scout");
  });
});
