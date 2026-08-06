export interface FactoryEvidenceClient {
  getEvidence(ref: string): Promise<string>;
  listEvidenceMeta(runId: string): Promise<string>;
}

export interface EvidenceStore {
  getEvidenceByRef(ref: string): Promise<unknown | null>;
  listEvidenceMeta(runId: string): Promise<readonly { id: string; kind: string; sha256: string }[]>;
}

export function createFactoryEvidenceClient(store?: EvidenceStore): FactoryEvidenceClient {
  const evidenceStore = store ?? inMemoryEvidenceStore();
  return {
    async getEvidence(ref: string): Promise<string> {
      const payload = await evidenceStore.getEvidenceByRef(ref);
      if (!payload) return JSON.stringify({ error: "not_found", ref });
      return typeof payload === "string" ? payload : JSON.stringify(payload);
    },
    async listEvidenceMeta(runId: string): Promise<string> {
      const items = await evidenceStore.listEvidenceMeta(runId);
      return JSON.stringify({ runId, items });
    },
  };
}

function inMemoryEvidenceStore(): EvidenceStore {
  const payloads = new Map<string, unknown>();
  return {
    async getEvidenceByRef(ref: string) {
      return payloads.get(ref) ?? null;
    },
    async listEvidenceMeta(runId: string) {
      return [...payloads.keys()]
        .filter((ref) => ref.includes(runId))
        .map((id) => ({ id, kind: "artifact", sha256: id }));
    },
  };
}
