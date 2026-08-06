import { describe, expect, it } from "vitest";
import { buildEvidenceManifest, computeManifestHash } from "../../src/evidence/manifest.js";

describe("evidence manifest", () => {
  const base = {
    runId: "run-1",
    taskId: "task-1",
    sourceRevision: "abc123",
    workflowVersion: "wf-1",
    policyVersion: "policy-1",
    evidenceItemIds: ["ev-1"],
    updatedAt: "2026-08-06T12:00:00.000Z",
  };

  it("builds a versioned manifest with stable hash", () => {
    const manifest = buildEvidenceManifest(base);
    const hash = computeManifestHash(manifest);
    expect(manifest.schemaVersion).toBe("evidence-manifest.v1");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(computeManifestHash(manifest)).toBe(hash);
  });

  it("changes manifest hash when evidence mutates", () => {
    const before = computeManifestHash(buildEvidenceManifest(base));
    const after = computeManifestHash(buildEvidenceManifest({ ...base, evidenceItemIds: ["ev-1", "ev-2"] }));
    expect(after).not.toBe(before);
  });

  it("detects tampering via hash mismatch", () => {
    const manifest = buildEvidenceManifest(base);
    const hash = computeManifestHash(manifest);
    const tampered = { ...manifest, evidenceItemIds: ["ev-tampered"] };
    expect(computeManifestHash(tampered)).not.toBe(hash);
  });
});
