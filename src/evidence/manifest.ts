import { createHash } from "node:crypto";
import { stableSerialize } from "../contracts/evidence.js";

export interface EvidenceManifest {
  schemaVersion: "evidence-manifest.v1";
  runId: string;
  sourceRevision?: string;
  taskId?: string;
  requirementIds?: readonly string[];
  workflowVersion?: string;
  policyVersion?: string;
  modelVersions?: Readonly<Record<string, string>>;
  promptVersions?: Readonly<Record<string, string>>;
  skillVersions?: Readonly<Record<string, string>>;
  toolVersions?: Readonly<Record<string, string>>;
  sandboxImage?: string;
  diffHash?: string;
  evidenceItemIds: readonly string[];
  gateDecisionKeys?: readonly string[];
  scenarioRunKeys?: readonly string[];
  fitnessResultKeys?: readonly string[];
  artifactDigest?: string;
  artifactSignature?: string;
  deploymentProfile?: string;
  observationStatus?: string;
  rollbackTarget?: string;
  updatedAt: string;
}

export type EvidenceManifestInput = Omit<EvidenceManifest, "schemaVersion" | "updatedAt"> & {
  updatedAt?: string;
};

export function buildEvidenceManifest(input: EvidenceManifestInput): EvidenceManifest {
  return {
    schemaVersion: "evidence-manifest.v1",
    ...input,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function computeManifestHash(manifest: EvidenceManifest): string {
  return createHash("sha256").update(stableSerialize(manifest)).digest("hex");
}
