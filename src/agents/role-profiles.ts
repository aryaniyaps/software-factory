import type { AgentRole } from "../contracts/nodes.js";
import { harnessForRole, ROLE_HARNESS_SPECS, roleAgentDir, roleLoaderOptions as harnessLoaderOptions } from "./role-harness.js";

export interface RoleProfile {
  skills: readonly string[];
  mentalModels: readonly string[];
  hindsightOperations: readonly ("recall" | "reflect" | "retain")[];
  thinkingLevel: "low" | "medium" | "high";
}

export const ROLE_PROFILES: Record<AgentRole, RoleProfile> = Object.fromEntries(
  Object.entries(ROLE_HARNESS_SPECS).map(([role, spec]) => [role, {
    skills: spec.skills,
    mentalModels: spec.mentalModels,
    hindsightOperations: spec.hindsightOperations,
    thinkingLevel: spec.thinkingLevel,
  }]),
) as Record<AgentRole, RoleProfile>;

export function profileForRole(role: string): RoleProfile {
  const profile = ROLE_PROFILES[role as AgentRole];
  if (!profile) throw new Error(`unknown Pi role: ${role}`);
  return profile;
}

export function roleLoaderOptions(role: string, resourceRoot: string): { agentDir: string; additionalSkillPaths: string[] } {
  return harnessLoaderOptions(role, resourceRoot);
}

export function roleLoaderOptionsForWorktree(input: { role: string; cwd: string; resourceRoot?: string }): { agentDir: string; additionalSkillPaths: string[] } {
  const bootstrappedRoot = input.resourceRoot ?? process.env.PI_RESOURCE_ROOT;
  if (bootstrappedRoot) {
    return harnessLoaderOptions(input.role, bootstrappedRoot);
  }
  const trustedRoot = process.env.FACTORY_REPO_ROOT ?? process.cwd();
  return { agentDir: roleAgentDir(trustedRoot, input.role, "repo"), additionalSkillPaths: [] };
}

export function allRoleSkillPaths(): string[] {
  return [...new Set(Object.values(ROLE_HARNESS_SPECS).flatMap((spec) => [...spec.skills]))];
}
