import { afterEach, describe, expect, it } from "vitest";
import { AgentRoles } from "../../src/contracts/nodes.js";
import {
  DEFAULT_FACTORY_MODEL_ID,
  hasRoleModelOverride,
  resolveModelId,
  roleModelEnvKey,
} from "../../src/agents/model-resolver.js";
import { harnessForRole } from "../../src/agents/role-harness.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveModelId", () => {
  it("maps each agent role to a role-specific env key", () => {
    expect(roleModelEnvKey("scout")).toBe("FACTORY_MODEL_SCOUT");
    expect(roleModelEnvKey("maintainability_critic")).toBe("FACTORY_MODEL_CRITIC");
    expect(roleModelEnvKey("unknown")).toBeUndefined();
  });

  it("uses factory/default when no role override is set", () => {
    delete process.env.FACTORY_MODEL_SCOUT;
    expect(hasRoleModelOverride("scout")).toBe(false);
    expect(resolveModelId("scout")).toBe(DEFAULT_FACTORY_MODEL_ID);
  });

  it("uses the harness modelId when the role override env is set", () => {
    process.env.FACTORY_MODEL_SCOUT = "anthropic/claude-sonnet-4-20250514";
    expect(hasRoleModelOverride("scout")).toBe(true);
    expect(resolveModelId("scout")).toBe(harnessForRole("scout").modelId);
    expect(resolveModelId("scout")).toBe("factory/scout");
  });

  it("treats whitespace-only overrides as unset", () => {
    process.env.FACTORY_MODEL_PLAN = "   ";
    expect(hasRoleModelOverride("plan")).toBe(false);
    expect(resolveModelId("plan")).toBe(DEFAULT_FACTORY_MODEL_ID);
  });

  it("assigns a distinct factory/* modelId to every agent role", () => {
    const modelIds = AgentRoles.map((role) => harnessForRole(role).modelId);
    expect(new Set(modelIds).size).toBe(AgentRoles.length);
    for (const role of AgentRoles) {
      expect(harnessForRole(role).modelId).toMatch(/^factory\//);
    }
  });
});
