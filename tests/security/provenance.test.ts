import { describe, expect, it } from "vitest";
import {
  assertDerivedDigest,
  buildProvenance,
  extractDigestFromBuildOutput,
  signProvenance,
  verifyProvenanceSignature,
} from "../../src/security/provenance.js";

const digestHex = "a".repeat(64);
const image = "registry.example/app";
const derivedDigest = `${image}@sha256:${digestHex}`;

describe("build provenance", () => {
  it("extracts digest from build output instead of trusting configuration", () => {
    const output = `exporting to image\n#1 pushing manifest for ${image}@sha256:${digestHex}`;
    expect(extractDigestFromBuildOutput(output, "", image)).toBe(derivedDigest);
  });

  it("rejects configured digest that differs from derived build output", () => {
    const other = `${image}@sha256:${"b".repeat(64)}`;
    expect(() => assertDerivedDigest(derivedDigest, other)).toThrow("configured digest does not match derived build output");
    expect(() => assertDerivedDigest(derivedDigest)).not.toThrow();
  });

  it("signs and verifies provenance for the derived digest", () => {
    const provenance = buildProvenance({
      image,
      digest: derivedDigest,
      sbomSha256: "c".repeat(64),
      sourceRevision: "abc123",
      builtAt: "2026-08-06T00:00:00.000Z",
    });
    const signature = signProvenance(provenance, "test-signing-key");
    expect(verifyProvenanceSignature(provenance, signature, "test-signing-key")).toBe(true);
    expect(verifyProvenanceSignature(provenance, signature, "wrong-key")).toBe(false);
  });
});
