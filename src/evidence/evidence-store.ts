import type { EvidenceKind } from "../contracts/evidence.js";
import type { FactoryProjection } from "../db/factory-projection.js";
import type { ObjectStore } from "./object-store.js";
import { sha256Hex } from "./object-store.js";
import { buildEvidenceManifest, computeManifestHash, type EvidenceManifest } from "./manifest.js";

export interface EvidenceItemInput {
  id: string;
  kind: EvidenceKind;
  schemaVersion: string;
  mediaType: string;
  sha256?: string;
  producer: { type: string; id: string; version: string };
  subject: Record<string, string>;
  createdAt: string;
  redaction: "none" | "secrets" | "pii";
}

export interface EvidenceStore {
  appendEvent(input: { runId: string; eventId: string; type: string; payload: unknown }): Promise<{ inserted: boolean }>;
  appendEvidence(input: { runId: string; item: EvidenceItemInput; body: Buffer | string }): Promise<{ id: string; sha256: string; uri: string }>;
  recordGateDecision(input: {
    runId: string;
    gateId: string;
    decision: string;
    policyVersion: string;
    reasons: unknown;
    evidenceRefs: readonly string[];
    decidedAt?: string;
  }): Promise<void>;
  rebuildManifest(runId: string, context?: Partial<EvidenceManifest>): Promise<{ manifest: EvidenceManifest; hash: string }>;
}

export interface EvidenceStoreDependencies {
  projection: FactoryProjection;
  objectStore: ObjectStore;
  maxInlineBytes: number;
}

export function createEvidenceStore(deps: EvidenceStoreDependencies): EvidenceStore {
  const { projection, objectStore, maxInlineBytes } = deps;

  return {
    async appendEvent(input) {
      return await projection.recordEventOutbox(input);
    },

    async appendEvidence(input) {
      const body = typeof input.body === "string" ? input.body : input.body.toString("utf8");
      if (maxInlineBytes > 0 && body.length > maxInlineBytes) {
        throw new Error(`Evidence body exceeds inline limit of ${maxInlineBytes} bytes`);
      }

      const computedSha256 = sha256Hex(body);
      if (input.item.sha256 && input.item.sha256 !== computedSha256) {
        throw new Error(`Evidence hash mismatch for ${input.item.id}: declared ${input.item.sha256}, computed ${computedSha256}`);
      }

      const objectPath = `${input.runId}/evidence/${input.item.id}`;
      const stored = await objectStore.put(objectPath, body);
      await objectStore.verify(objectPath, stored.sha256);

      await projection.recordEvidenceItem({
        runId: input.runId,
        id: input.item.id,
        kind: input.item.kind,
        schemaVersion: input.item.schemaVersion,
        mediaType: input.item.mediaType,
        sha256: stored.sha256,
        uri: stored.uri,
        producer: input.item.producer,
        subject: input.item.subject,
        createdAt: input.item.createdAt,
        redaction: input.item.redaction,
      });

      await this.rebuildManifest(input.runId);
      return { id: input.item.id, sha256: stored.sha256, uri: stored.uri };
    },

    async recordGateDecision(input) {
      await projection.recordGateDecision(input);
      await this.rebuildManifest(input.runId);
    },

    async rebuildManifest(runId, context = {}) {
      const evidenceIds = await projection.listEvidenceItemIds(runId);
      const gateKeys = await projection.listGateDecisionKeys(runId);
      const run = await projection.getRun(runId);
      const manifest = buildEvidenceManifest({
        runId,
        taskId: run?.taskId,
        evidenceItemIds: evidenceIds,
        gateDecisionKeys: gateKeys,
        ...context,
      });
      const hash = computeManifestHash(manifest);
      await projection.recordEvidenceManifest({ runId, manifest, hash });
      return { manifest, hash };
    },
  };
}
