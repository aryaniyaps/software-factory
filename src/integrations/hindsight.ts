import { documentId, type CorrelationContext } from "./correlation.js";
import { memoryTags, type HindsightTemplate } from "./hindsight-config.js";

interface HindsightClientLike {
  retainBatch(bank: string, items: Array<{ content: string; document_id?: string; tags?: string[] }>, options?: { async?: boolean }): Promise<unknown>;
  recall(bank: string, query: string, options?: { tags?: string[] }): Promise<unknown[]>;
  reflect(bank: string, query: string, options?: { tags?: string[] }): Promise<string>;
  importTemplate?(bank: string, template: HindsightTemplate): Promise<{ operation_id?: string }>;
  getMentalModel?(bank: string, modelId: string, options?: { tags?: string[] }): Promise<unknown>;
  createBank?(bank: string, options: { retainMission: string; observationsMission: string; reflectMission: string }): Promise<unknown>;
  createDirective?(bank: string, name: string, content: string, options?: { tags?: string[] }): Promise<unknown>;
  createMentalModel?(bank: string, name: string, sourceQuery: string, options?: { id?: string; tags?: string[]; trigger?: { refreshAfterConsolidation?: boolean } }): Promise<{ operation_id?: string }>;
}

export interface MemoryProvider {
  recall(bank: string, query: string, context: CorrelationContext): Promise<unknown[]>;
  retain(bank: string, content: string, context: CorrelationContext): Promise<void>;
  reflect(bank: string, query: string, context: CorrelationContext): Promise<string>;
}

export class HindsightMemory implements MemoryProvider {
  constructor(private readonly client: HindsightClientLike) {}

  async recall(bank: string, query: string, context: CorrelationContext): Promise<unknown[]> {
    return this.client.recall(bank, query, { tags: memoryTags(context) });
  }

  async retain(bank: string, content: string, context: CorrelationContext): Promise<void> {
    await this.client.retainBatch(bank, [{ content, document_id: documentId(context), tags: memoryTags(context) }], { async: true });
  }

  async reflect(bank: string, query: string, context: CorrelationContext): Promise<string> {
    return this.client.reflect(bank, query, { tags: memoryTags(context) });
  }

  async bootstrapBank(bank: string, template: HindsightTemplate): Promise<string | undefined> {
    if (this.client.importTemplate) return (await this.client.importTemplate(bank, template)).operation_id;
    if (!this.client.createBank || !this.client.createMentalModel) return undefined;
    await this.client.createBank(bank, { retainMission: template.bank.retain_mission, observationsMission: template.bank.observations_mission, reflectMission: template.bank.reflect_mission });
    for (const directive of template.bank.directives ?? []) await this.client.createDirective?.(bank, directive.slice(0, 64), directive);
    let operationId: string | undefined;
    for (const model of template.mental_models) operationId = (await this.client.createMentalModel(bank, model.name, model.source_query, { id: model.id, tags: model.tags, trigger: model.trigger ? { refreshAfterConsolidation: model.trigger.refresh_after_consolidation } : undefined })).operation_id ?? operationId;
    return operationId;
  }

  async recallProject(request: { bank: string; query: string; tags: readonly string[] }): Promise<unknown[]> {
    const result = await this.client.recall(request.bank, request.query, { tags: [...request.tags] }) as unknown;
    return Array.isArray(result) ? result : ((result as { results?: unknown[] }).results ?? []);
  }

  async reflectProject(request: { bank: string; query: string; tags: readonly string[] }): Promise<string> {
    const result = await this.client.reflect(request.bank, request.query, { tags: [...request.tags] }) as unknown;
    return typeof result === "string" ? result : String((result as { text?: string; answer?: string }).text ?? (result as { answer?: string }).answer ?? JSON.stringify(result));
  }

  async getMentalModelForProject(bank: string, modelId: string, tags: readonly string[]): Promise<unknown> {
    return this.client.getMentalModel?.(bank, modelId, { tags: [...tags] }) ?? null;
  }

  async getMentalModel(bank: string, modelId: string, context: CorrelationContext): Promise<unknown> {
    if (!this.client.getMentalModel) return null;
    return this.client.getMentalModel(bank, modelId, { tags: memoryTags(context) });
  }
}
