import type { CorrelationContext } from "./correlation.js";

export interface HindsightTemplate {
  version: string;
  bank: {
    retain_mission: string;
    observations_mission: string;
    reflect_mission: string;
    directives?: string[];
  };
  mental_models: Array<{
    id: string;
    name: string;
    source_query: string;
    tags?: string[];
    trigger?: { refresh_after_consolidation?: boolean };
  }>;
}

export function validateHindsightTemplate(template: unknown): HindsightTemplate {
  if (!template || typeof template !== "object") {
    throw new Error("Hindsight template must be a JSON object");
  }

  const value = template as Partial<HindsightTemplate>;
  if (typeof value.version !== "string" || value.version.trim() === "") {
    throw new Error("Hindsight template requires a non-empty version");
  }

  if (!value.bank || typeof value.bank !== "object") {
    throw new Error("Hindsight template requires a bank configuration object");
  }

  const { retain_mission, observations_mission, reflect_mission, directives } = value.bank;
  if (typeof retain_mission !== "string" || retain_mission.trim() === "") {
    throw new Error("Hindsight template bank.retain_mission is required");
  }
  if (typeof observations_mission !== "string" || observations_mission.trim() === "") {
    throw new Error("Hindsight template bank.observations_mission is required");
  }
  if (typeof reflect_mission !== "string" || reflect_mission.trim() === "") {
    throw new Error("Hindsight template bank.reflect_mission is required");
  }
  if (
    directives !== undefined
    && (!Array.isArray(directives) || directives.some((directive) => typeof directive !== "string" || directive.trim() === ""))
  ) {
    throw new Error("Hindsight template bank.directives must be an array of non-empty strings when provided");
  }

  if (!Array.isArray(value.mental_models)) {
    throw new Error("Hindsight template requires a mental_models array");
  }

  for (const model of value.mental_models) {
    if (!model || typeof model !== "object") {
      throw new Error("Hindsight template mental_models entries must be objects");
    }
    if (typeof model.id !== "string" || model.id.trim() === "") {
      throw new Error("Hindsight template mental model id is required");
    }
    if (typeof model.name !== "string" || model.name.trim() === "") {
      throw new Error(`Hindsight template mental model "${model.id}" requires a name`);
    }
    if (typeof model.source_query !== "string" || model.source_query.trim() === "") {
      throw new Error(`Hindsight template mental model "${model.id}" requires source_query`);
    }
    if (
      model.tags !== undefined
      && (!Array.isArray(model.tags) || model.tags.some((tag) => typeof tag !== "string" || tag.trim() === ""))
    ) {
      throw new Error(`Hindsight template mental model "${model.id}" tags must be an array of non-empty strings`);
    }
    if (
      model.trigger !== undefined
      && (typeof model.trigger !== "object" || model.trigger.refresh_after_consolidation !== undefined
        && typeof model.trigger.refresh_after_consolidation !== "boolean")
    ) {
      throw new Error(`Hindsight template mental model "${model.id}" trigger.refresh_after_consolidation must be a boolean`);
    }
  }

  return value as HindsightTemplate;
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
