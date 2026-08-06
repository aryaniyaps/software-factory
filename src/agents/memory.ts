import type { HindsightMemory } from "../integrations/hindsight.js";

export interface AgentMemoryRequest {
  bank: string;
  role: string;
  query: string;
  mentalModels: readonly string[];
  tags: readonly string[];
  operations: readonly ("recall" | "reflect" | "retain")[];
}

export async function assembleAgentMemory(
  memory: Pick<HindsightMemory, "recallProject" | "reflectProject" | "getMentalModelForProject">,
  request: AgentMemoryRequest,
  maxChars = 12_000,
): Promise<string> {
  const operations = new Set(request.operations);
  const sections = [`Role: ${request.role}`];

  if (operations.has("recall")) {
    const recall = await memory.recallProject({ bank: request.bank, query: request.query, tags: request.tags });
    sections.push(`Recall:\n${JSON.stringify(recall)}`);
  }
  if (operations.has("reflect")) {
    const reflection = await memory.reflectProject({ bank: request.bank, query: request.query, tags: request.tags });
    sections.push(`Reflection:\n${reflection}`);
  }
  if (request.mentalModels.length > 0) {
    const models = await Promise.all(
      request.mentalModels.map((modelId) => memory.getMentalModelForProject(request.bank, modelId, request.tags)),
    );
    sections.push(`Mental models:\n${JSON.stringify(models)}`);
  }

  return sections.join("\n\n").slice(0, maxChars);
}

export function retainableAgentOutcome(role: string, output: string): string {
  try {
    const parsed = JSON.parse(output) as { status?: string; summary?: string; evidenceRefs?: unknown };
    return JSON.stringify({
      role,
      status: parsed.status ?? "unknown",
      summary: parsed.summary ?? "",
      evidenceRefs: parsed.evidenceRefs ?? [],
    });
  } catch {
    return JSON.stringify({ role, status: "unknown", summary: output.slice(0, 2_000), evidenceRefs: [] });
  }
}
