import { describe, expect, it } from "vitest";
import {
  buildRollbackPlan,
  createRollbackFence,
  rollbackIdempotencyKey,
  shouldRollback,
} from "../../src/release/rollback.js";

describe("release rollback", () => {
  const candidateDigest = `registry/app@sha256:${"a".repeat(64)}`;
  const previousDigest = `registry/app@sha256:${"b".repeat(64)}`;

  it("requires rollback when observation fails", () => {
    expect(shouldRollback({ decision: "fail", reasons: ["semantic_check_failed"] })).toBe(true);
    expect(shouldRollback({ decision: "pass", reasons: [] })).toBe(false);
    expect(shouldRollback({ decision: "insufficient", reasons: ["missing_semantic_evidence"] })).toBe(false);
  });

  it("targets the exact previous digest for rollback", () => {
    const plan = buildRollbackPlan({
      deploymentId: "dep-1",
      candidateDigest,
      previousDigest,
    });
    expect(plan.targetDigest).toBe(previousDigest);
    expect(plan.candidateDigest).toBe(candidateDigest);
  });

  it("uses stable idempotency keys per deployment and digest pair", () => {
    const key = rollbackIdempotencyKey({
      deploymentId: "dep-1",
      candidateDigest,
      previousDigest,
    });
    expect(key).toBe(`rollback:dep-1:${candidateDigest}->${previousDigest}`);
    expect(rollbackIdempotencyKey({
      deploymentId: "dep-1",
      candidateDigest,
      previousDigest,
    })).toBe(key);
  });

  it("creates rollback fencing metadata", () => {
    const fence = createRollbackFence("dep-1");
    expect(fence.deploymentId).toBe("dep-1");
    expect(fence.fencedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
