import type { CorrelationContext } from "./correlation.js";

export interface HindsightTemplate {
  version: string;
  bank: {
    retain_mission: string;
    observations_mission: string;
    reflect_mission: string;
    directives?: string[];
  };
  mental_models: Array<{ id: string; name: string; source_query: string; tags?: string[]; trigger?: { refresh_after_consolidation?: boolean } }>;
}

export function projectBankId(organization: string, project: string): string {
  const value = `${organization}-${project}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!value) throw new Error("organization and project must contain an identifier");
  return value;
}

export function resolveProjectBank(
  input: { organization?: string; project?: string; repository: string },
  env: Record<string, string | undefined> = process.env,
): string {
  const organization = input.organization ?? env.FACTORY_ORGANIZATION ?? "default";
  const project = input.project ?? env.FACTORY_PROJECT ?? input.repository;
  return projectBankId(organization, project);
}

export function memoryBankFromEnv(env: Record<string, string | undefined> = process.env): string {
  const organization = env.FACTORY_ORGANIZATION;
  const project = env.FACTORY_PROJECT;
  if (!organization || !project) throw new Error("FACTORY_ORGANIZATION and FACTORY_PROJECT are required");
  return projectBankId(organization, project);
}

export function memoryTags(context: CorrelationContext): string[] {
  return [
    context.organization && `org:${normalize(context.organization)}`,
    context.project && `project:${normalize(context.project)}`,
    context.repository && `repository:${context.repository}`,
    `run:${context.factoryRunId}`,
    context.agentRole && `role:${context.agentRole}`,
    `phase:${context.phaseId}`,
  ].filter((tag): tag is string => Boolean(tag));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_-]+/g, "-");
}
