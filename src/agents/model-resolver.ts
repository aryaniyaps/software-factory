import type { AgentRole } from "../contracts/nodes.js";
import { harnessForRole } from "./role-harness.js";

export const DEFAULT_FACTORY_MODEL_ID = "factory/default";

const ROLE_MODEL_ENV_KEYS: Record<AgentRole, string> = {
  scout: "FACTORY_MODEL_SCOUT",
  plan: "FACTORY_MODEL_PLAN",
  implement: "FACTORY_MODEL_IMPLEMENT",
  repair: "FACTORY_MODEL_REPAIR",
  review: "FACTORY_MODEL_REVIEW",
  maintainability_critic: "FACTORY_MODEL_CRITIC",
};

export function roleModelEnvKey(role: string): string | undefined {
  return ROLE_MODEL_ENV_KEYS[role as AgentRole];
}

export function hasRoleModelOverride(role: string): boolean {
  const envKey = roleModelEnvKey(role);
  if (!envKey) return false;
  return Boolean(process.env[envKey]?.trim());
}

export function resolveModelId(role: string): string {
  if (hasRoleModelOverride(role)) return harnessForRole(role).modelId;
  return DEFAULT_FACTORY_MODEL_ID;
}
