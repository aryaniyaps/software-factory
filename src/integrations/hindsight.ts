import { documentId, type CorrelationContext } from "./correlation.js";
import { memoryTags, type HindsightTemplate } from "./hindsight-config.js";

interface HindsightClientLike {
  retainBatch(bank: string, items: Array<{ content: string; document_id?: string; tags?: string[] }>, options?: { async?: boolean }): Promise<unknown>;
  recall(bank: string, query: string, options?: { tags?: string[] }): Promise<unknown[]>;
  reflect(bank: string, query: string, options?: { tags?: string[] }): Promise<string>;
  importTemplate?(bank: string, template: HindsightTemplate): Promise<{ operation_id?: string }>;
  getMentalModel?(bank: string, modelId: string, options?: { tags?: string[] }): Promise<unknown>;
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
    if (!this.client.importTemplate) return undefined;
    const result = await this.client.importTemplate(bank, template);
    return result.operation_id;
  }

  async getMentalModel(bank: string, modelId: string, context: CorrelationContext): Promise<unknown> {
    if (!this.client.getMentalModel) return null;
    return this.client.getMentalModel(bank, modelId, { tags: memoryTags(context) });
  }
}
