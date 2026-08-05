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
