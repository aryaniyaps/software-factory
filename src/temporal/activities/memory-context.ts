import { assembleAgentMemory, type AgentMemoryRequest } from "../../agents/memory.js";

export interface MemoryContextRequest {
  bank: string;
  role: string;
  query: string;
  mentalModels: readonly string[];
  tags: readonly string[];
}

export interface MemoryContextReader {
  recallProject(request: MemoryContextRequest): Promise<unknown[]>;
  reflectProject(request: MemoryContextRequest): Promise<string>;
  getMentalModel(bank: string, modelId: string, options: { tags: readonly string[] }): Promise<unknown>;
}

export async function buildMemoryContext(reader: MemoryContextReader, request: MemoryContextRequest, maxChars = 12_000): Promise<string> {
  const adapter = {
    recallProject: (input: { bank: string; query: string; tags: readonly string[] }) => reader.recallProject({ ...request, ...input }),
    reflectProject: (input: { bank: string; query: string; tags: readonly string[] }) => reader.reflectProject({ ...request, ...input }),
    getMentalModelForProject: (bank: string, modelId: string, tags: readonly string[]) => reader.getMentalModel(bank, modelId, { tags }),
  };
  const fullRequest: AgentMemoryRequest = {
    ...request,
    operations: ["recall", "reflect", "retain"],
  };
  return assembleAgentMemory(adapter, fullRequest, maxChars);
}
