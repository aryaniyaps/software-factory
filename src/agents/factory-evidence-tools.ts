import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

export interface FactoryEvidenceReader {
  getEvidence(ref: string): Promise<unknown>;
  listEvidenceMeta(runId: string): Promise<unknown>;
}

const noopReader: FactoryEvidenceReader = {
  async getEvidence(ref) {
    return { ref, note: "Evidence payload requires an object reference from the Temporal execution view.", stub: true };
  },
  async listEvidenceMeta(runId) {
    return { runId, items: [], stub: true };
  },
};

let reader: FactoryEvidenceReader = noopReader;

export function setFactoryEvidenceReader(next: FactoryEvidenceReader): void {
  reader = next;
}

export function createGetEvidenceTool() {
  return defineTool({
    name: "get_evidence",
    label: "Get evidence",
    description: "Fetch immutable factory evidence by reference id.",
    parameters: Type.Object({ ref: Type.String({ minLength: 1 }) }),
    execute: async (_id, input) => ({
      content: [{ type: "text", text: JSON.stringify(await reader.getEvidence(input.ref), null, 2) }],
      details: { ref: input.ref },
    }),
  });
}

export function createListEvidenceMetaTool() {
  return defineTool({
    name: "list_evidence_meta",
    label: "List evidence metadata",
    description: "List evidence item metadata for a factory run.",
    parameters: Type.Object({ runId: Type.String({ minLength: 1 }) }),
    execute: async (_id, input) => ({
      content: [{ type: "text", text: JSON.stringify(await reader.listEvidenceMeta(input.runId), null, 2) }],
      details: { runId: input.runId },
    }),
  });
}
