import { HindsightClient, HindsightError } from "@vectorize-io/hindsight-client";
import type { MentalModelResponse } from "@vectorize-io/hindsight-client";
import { documentId, type CorrelationContext } from "./correlation.js";
import { memoryTags, validateHindsightTemplate, type HindsightTemplate } from "./hindsight-config.js";

export interface MemoryProvider {
  recall(bank: string, query: string, context: CorrelationContext): Promise<unknown[]>;
  retain(bank: string, content: string, context: CorrelationContext): Promise<void>;
  reflect(bank: string, query: string, context: CorrelationContext): Promise<string>;
}

const REQUIRED_CLIENT_METHODS = [
  "getVersion",
  "retainBatch",
  "recall",
  "reflect",
  "createBank",
  "createDirective",
  "createMentalModel",
  "getMentalModel",
] as const satisfies readonly (keyof HindsightClient)[];

export async function assertHindsightCompatibility(client: HindsightClient): Promise<void> {
  for (const method of REQUIRED_CLIENT_METHODS) {
    if (typeof client[method] !== "function") {
      throw new Error(
        `Hindsight client is missing required method "${method}". Upgrade @vectorize-io/hindsight-client and the Hindsight Docker image together.`,
      );
    }
  }

  try {
    const version = await client.getVersion();
    if (!version.features.worker) {
      throw new Error(
        "Hindsight worker is disabled. Mental model bootstrap requires background processing; deploy Hindsight with worker enabled or upgrade to a compatible image.",
      );
    }
  } catch (error) {
    if (error instanceof HindsightError) {
      throw new Error(
        `Unable to reach Hindsight at startup (${error.statusCode ?? "unknown status"}): ${error.message}. Check HINDSIGHT_BASE_URL, HINDSIGHT_API_KEY, and that the Hindsight service is running.`,
        { cause: error },
      );
    }
    throw error;
  }
}

export class HindsightMemory implements MemoryProvider {
  constructor(private readonly client: HindsightClient) {}

  async recall(bank: string, query: string, context: CorrelationContext): Promise<unknown[]> {
    const response = await this.client.recall(bank, query, { tags: memoryTags(context) });
    return response.results;
  }

  async retain(bank: string, content: string, context: CorrelationContext): Promise<void> {
    await this.client.retainBatch(
      bank,
      [{ content, document_id: documentId(context), tags: memoryTags(context) }],
      { async: true },
    );
  }

  async reflect(bank: string, query: string, context: CorrelationContext): Promise<string> {
    const response = await this.client.reflect(bank, query, { tags: memoryTags(context) });
    return response.text;
  }

  async bootstrapBank(bank: string, template: HindsightTemplate): Promise<string | undefined> {
    const validated = validateHindsightTemplate(template);

    await this.client.createBank(bank, {
      retainMission: validated.bank.retain_mission,
      observationsMission: validated.bank.observations_mission,
      reflectMission: validated.bank.reflect_mission,
    });

    for (const directive of validated.bank.directives ?? []) {
      await this.client.createDirective(bank, directive.slice(0, 64), directive);
    }

    let lastOperationId: string | undefined;
    for (const model of validated.mental_models) {
      const result = await this.client.createMentalModel(bank, model.name, model.source_query, {
        id: model.id,
        tags: model.tags,
        trigger: model.trigger
          ? { refreshAfterConsolidation: model.trigger.refresh_after_consolidation }
          : undefined,
      });
      lastOperationId = result.operation_id;
    }

    return lastOperationId;
  }

  async recallProject(request: { bank: string; query: string; tags: readonly string[] }): Promise<unknown[]> {
    const response = await this.client.recall(request.bank, request.query, { tags: [...request.tags] });
    return response.results;
  }

  async reflectProject(request: { bank: string; query: string; tags: readonly string[] }): Promise<string> {
    const response = await this.client.reflect(request.bank, request.query, { tags: [...request.tags] });
    return response.text;
  }

  async getMentalModelForProject(
    bank: string,
    modelId: string,
    _tags: readonly string[],
  ): Promise<MentalModelResponse | null> {
    try {
      return await this.client.getMentalModel(bank, modelId, { detail: "content" });
    } catch (error) {
      if (error instanceof HindsightError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async getMentalModel(bank: string, modelId: string, _context: CorrelationContext): Promise<MentalModelResponse | null> {
    try {
      return await this.client.getMentalModel(bank, modelId, { detail: "content" });
    } catch (error) {
      if (error instanceof HindsightError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}
