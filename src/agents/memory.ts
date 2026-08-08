import type { HindsightMemory } from "../integrations/hindsight.js";

export interface AgentMemoryRequest {
  bank: string;
  role: string;
  query: string;
  mentalModels: readonly string[];
  tags: readonly string[];
  operations: readonly ("recall" | "reflect" | "retain")[];
}

export function memoryQueryFromAgentValue(role: string, value: unknown, maxChars = 1_800): string {
  if (!value || typeof value !== "object") return role;
  const record = value as Record<string, unknown>;
  const parts: string[] = [`role=${role}`];
  const task = record.task;
  if (task && typeof task === "object") {
    const taskRecord = task as Record<string, unknown>;
    if (typeof taskRecord.prompt === "string") parts.push(`task=${taskRecord.prompt.slice(0, 400)}`);
    if (typeof taskRecord.title === "string") parts.push(`title=${taskRecord.title.slice(0, 120)}`);
    if (typeof taskRecord.repository === "string") parts.push(`repository=${taskRecord.repository}`);
  }
  const clarification = record.clarification;
  if (clarification && typeof clarification === "object") {
    const clarificationRecord = clarification as Record<string, unknown>;
    const request = clarificationRecord.request;
    if (request && typeof request === "object" && typeof (request as { question?: unknown }).question === "string") {
      parts.push(`question=${(request as { question: string }).question.slice(0, 300)}`);
    }
    const answer = clarificationRecord.answer;
    if (answer && typeof answer === "object" && typeof (answer as { body?: unknown }).body === "string") {
      parts.push(`answer=${(answer as { body: string }).body.slice(0, 300)}`);
    }
  }
  if (Array.isArray(record.predecessors)) {
    for (const predecessor of record.predecessors.slice(0, 4)) {
      if (!predecessor || typeof predecessor !== "object") continue;
      const output = predecessor as { role?: unknown; summary?: unknown; status?: unknown };
      if (typeof output.role === "string") {
        const summary = typeof output.summary === "string" ? output.summary.slice(0, 200) : "";
        parts.push(`predecessor ${output.role}${output.status ? ` (${String(output.status)})` : ""}: ${summary}`);
      }
    }
  }
  return parts.join("\n").slice(0, maxChars);
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
