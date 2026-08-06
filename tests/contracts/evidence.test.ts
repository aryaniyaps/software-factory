import { describe, expect, it } from "vitest";
import { parseEvidenceItem, parseEvidenceRef, stableSerialize } from "../../src/contracts/evidence.js";

describe("evidence contracts", () => {
  const ref = { schemaVersion: "evidence-ref.v1", id: "ev-1", sha256: "a".repeat(64), uri: "s3://evidence/ev-1" };
  const item = {
    id: "ev-1",
    kind: "test",
    schemaVersion: "evidence.v1",
    mediaType: "application/json",
    sha256: "a".repeat(64),
    uri: "s3://evidence/ev-1",
    producer: { type: "factory", id: "checks", version: "1" },
    subject: { runId: "run-1", attemptId: "attempt-1" },
    createdAt: "2026-08-06T00:00:00.000Z",
    redaction: "none",
  } as const;

  it("accepts valid evidence references and items", () => {
    expect(parseEvidenceRef(ref)).toEqual(ref);
    expect(parseEvidenceItem(item)).toEqual(item);
  });

  it("rejects missing evidence fields and unknown fields", () => {
    expect(() => parseEvidenceRef({ id: "ev-1", uri: ref.uri })).toThrow();
    expect(() => parseEvidenceItem({ ...item, extra: true })).toThrow();
  });

  it("serializes equivalent objects deterministically", () => {
    expect(stableSerialize({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableSerialize({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});
