import { createHmac, createHash } from "node:crypto";
import { stableSerialize } from "../contracts/evidence.js";

export const DIGEST_PATTERN = /^.+@sha256:[a-f0-9]{64}$/;

export interface BuildProvenance {
  schemaVersion: "build-provenance.v1";
  image: string;
  digest: string;
  sbomSha256: string;
  sourceRevision: string;
  builtAt: string;
}

export function extractDigestFromBuildOutput(stdout: string, stderr: string, image: string): string {
  const combined = `${stdout}\n${stderr}`;
  const tagged = combined.match(new RegExp(`${escapeRegExp(image)}@sha256:([a-f0-9]{64})`, "i"));
  if (tagged) return `${image}@sha256:${tagged[1]}`;
  const digest = combined.match(/sha256:([a-f0-9]{64})/i);
  if (!digest) throw new Error("could not derive digest from build output");
  return `${image}@sha256:${digest[1]}`;
}

export function assertDerivedDigest(derivedDigest: string, configuredDigest?: string): void {
  if (!DIGEST_PATTERN.test(derivedDigest)) throw new Error("immutable image digest required");
  if (configuredDigest && configuredDigest !== derivedDigest) {
    throw new Error("configured digest does not match derived build output");
  }
}

export function buildProvenance(input: Omit<BuildProvenance, "schemaVersion">): BuildProvenance {
  return { schemaVersion: "build-provenance.v1", ...input };
}

export function signProvenance(provenance: BuildProvenance, signingKey: string): string {
  return createHmac("sha256", signingKey).update(stableSerialize(provenance)).digest("hex");
}

export function verifyProvenanceSignature(provenance: BuildProvenance, signature: string, signingKey: string): boolean {
  const expected = signProvenance(provenance, signingKey);
  return timingSafeEqual(expected, signature);
}

export function provenanceSha256(provenance: BuildProvenance): string {
  return createHash("sha256").update(stableSerialize(provenance)).digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
