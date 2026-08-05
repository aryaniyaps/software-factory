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
  const [recall, reflection, models] = await Promise.all([
    reader.recallProject(request),
    reader.reflectProject(request),
    Promise.all(request.mentalModels.map((model) => reader.getMentalModel(request.bank, model, { tags: request.tags }))),
  ]);
  const sections = [
    `Role: ${request.role}`,
    `Recall:\n${JSON.stringify(recall)}`,
    `Reflection:\n${reflection}`,
    `Mental models:\n${JSON.stringify(models)}`,
  ];
  return sections.join("\n\n").slice(0, maxChars);
}
