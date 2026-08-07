import type { AgentRole } from "../contracts/nodes.js";
import { harnessForRole } from "./role-harness.js";

/** Default Pi provider — Codex subscription OAuth via ~/.pi/agent/auth.json */
export const DEFAULT_FACTORY_MODEL_PROVIDER = "openai-codex";
/** Default model when FACTORY_MODEL / per-role overrides are unset */
export const DEFAULT_FACTORY_MODEL_ID = "gpt-5.6-luna";

const ROLE_MODEL_ENV_KEYS: Record<AgentRole, string> = {
  scout: "FACTORY_MODEL_SCOUT",
  plan: "FACTORY_MODEL_PLAN",
  discovery_plan: "FACTORY_MODEL_DISCOVERY_PLAN",
  implement: "FACTORY_MODEL_IMPLEMENT",
  repair: "FACTORY_MODEL_REPAIR",
  review: "FACTORY_MODEL_REVIEW",
  maintainability_critic: "FACTORY_MODEL_CRITIC",
};

export interface ResolvedModel {
  readonly provider: string;
  readonly modelId: string;
}

export function roleModelEnvKey(role: string): string | undefined {
  return ROLE_MODEL_ENV_KEYS[role as AgentRole];
}

export function hasRoleModelOverride(role: string): boolean {
  const envKey = roleModelEnvKey(role);
  if (!envKey) return false;
  return Boolean(process.env[envKey]?.trim());
}

export function resolveModelProvider(): string {
  return process.env.FACTORY_MODEL_PROVIDER?.trim() || DEFAULT_FACTORY_MODEL_PROVIDER;
}

/** Concrete model id for a role (per-role env → FACTORY_MODEL → harness default → global default). */
export function resolveModelId(role: string): string {
  const envKey = roleModelEnvKey(role);
  const roleModel = envKey ? process.env[envKey]?.trim() : undefined;
  if (roleModel) return roleModel;
  const global = process.env.FACTORY_MODEL?.trim();
  if (global) return global;
  try {
    return harnessForRole(role).modelId;
  } catch {
    return DEFAULT_FACTORY_MODEL_ID;
  }
}

/** Resolve Pi provider + model for an agent role. */
export function resolveModel(role: string): ResolvedModel {
  return {
    provider: resolveModelProvider(),
    modelId: resolveModelId(role),
  };
}
