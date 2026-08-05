import { documentId, type CorrelationContext } from "./correlation.js";

interface HindsightClientLike {
  retainBatch(bank: string, items: Array<{ content: string; document_id?: string }>, options?: { async?: boolean }): Promise<unknown>;
  recall(bank: string, query: string): Promise<unknown[]>;
  reflect(bank: string, query: string): Promise<string>;
}

export interface MemoryProvider {
  recall(bank: string, query: string, context: CorrelationContext): Promise<unknown[]>;
  retain(bank: string, content: string, context: CorrelationContext): Promise<void>;
  reflect(bank: string, query: string, context: CorrelationContext): Promise<string>;
}

export class HindsightMemory implements MemoryProvider {
  constructor(private readonly client: HindsightClientLike) {}

  async recall(bank: string, query: string, _context: CorrelationContext): Promise<unknown[]> {
    return this.client.recall(bank, query);
  }

  async retain(bank: string, content: string, context: CorrelationContext): Promise<void> {
    await this.client.retainBatch(bank, [{ content, document_id: documentId(context) }], { async: true });
  }

  async reflect(bank: string, query: string, _context: CorrelationContext): Promise<string> {
    return this.client.reflect(bank, query);
  }
}
