import { afterEach, describe, expect, it } from "vitest";
import { AgentRoles } from "../../src/contracts/nodes.js";
import {
  DEFAULT_FACTORY_MODEL_ID,
  DEFAULT_FACTORY_MODEL_PROVIDER,
  hasRoleModelOverride,
  resolveModel,
  resolveModelId,
  resolveModelProvider,
  roleModelEnvKey,
} from "../../src/agents/model-resolver.js";
import { harnessForRole } from "../../src/agents/role-harness.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveModel", () => {
  it("maps each agent role to a role-specific env key", () => {
    expect(roleModelEnvKey("scout")).toBe("FACTORY_MODEL_SCOUT");
    expect(roleModelEnvKey("maintainability_critic")).toBe("FACTORY_MODEL_CRITIC");
    expect(roleModelEnvKey("unknown")).toBeUndefined();
  });

  it("defaults to openai-codex / gpt-5.6-luna", () => {
    delete process.env.FACTORY_MODEL_PROVIDER;
    delete process.env.FACTORY_MODEL;
    delete process.env.FACTORY_MODEL_PLAN;
    expect(resolveModelProvider()).toBe(DEFAULT_FACTORY_MODEL_PROVIDER);
    expect(resolveModel("plan")).toEqual({
      provider: "openai-codex",
      modelId: DEFAULT_FACTORY_MODEL_ID,
    });
  });

  it("uses FACTORY_MODEL when no per-role override is set", () => {
    process.env.FACTORY_MODEL = "gpt-5.6-sol";
    delete process.env.FACTORY_MODEL_SCOUT;
    expect(hasRoleModelOverride("scout")).toBe(false);
    expect(resolveModelId("scout")).toBe("gpt-5.6-sol");
  });

  it("prefers per-role overrides over FACTORY_MODEL", () => {
    process.env.FACTORY_MODEL = "gpt-5.6-luna";
    process.env.FACTORY_MODEL_PLAN = "gpt-5.6-sol";
    expect(hasRoleModelOverride("plan")).toBe(true);
    expect(resolveModel("plan")).toEqual({ provider: "openai-codex", modelId: "gpt-5.6-sol" });
    expect(resolveModel("implement")).toEqual({ provider: "openai-codex", modelId: "gpt-5.6-luna" });
  });

  it("treats whitespace-only overrides as unset", () => {
    process.env.FACTORY_MODEL = "gpt-5.6-luna";
    process.env.FACTORY_MODEL_PLAN = "   ";
    expect(hasRoleModelOverride("plan")).toBe(false);
    expect(resolveModelId("plan")).toBe("gpt-5.6-luna");
  });

  it("falls back to harness modelId when env is unset", () => {
    delete process.env.FACTORY_MODEL;
    delete process.env.FACTORY_MODEL_SCOUT;
    expect(resolveModelId("scout")).toBe(harnessForRole("scout").modelId);
  });

  it("honors FACTORY_MODEL_PROVIDER", () => {
    process.env.FACTORY_MODEL_PROVIDER = "openai";
    process.env.FACTORY_MODEL = "gpt-5.6-luna";
    expect(resolveModel("repair")).toEqual({ provider: "openai", modelId: "gpt-5.6-luna" });
  });

  it("assigns a modelId to every agent role", () => {
    delete process.env.FACTORY_MODEL;
    for (const role of AgentRoles) {
      delete process.env[roleModelEnvKey(role)!];
      expect(harnessForRole(role).modelId).toBeTruthy();
      expect(resolveModelId(role)).toBe(harnessForRole(role).modelId);
    }
  });
});
