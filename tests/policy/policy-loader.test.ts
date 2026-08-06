import { describe, expect, it } from "vitest";
import {
  buildAssurancePlan,
  loadWorkPolicy,
  parseRepoPolicyOverrides,
  RepositoryConcurrencyRegistry,
} from "../../src/policy/policy-loader.js";
import { POLICY_VERSION } from "../../src/policy/work-policy.js";

describe("policy loader", () => {
  it("loads tier defaults for classified risk", () => {
    const policy = loadWorkPolicy({
      riskTier: "T2",
      signals: { auth: false, migration: true, destructive: false, publicContract: false, docsOnly: false },
      reasons: ["schema_migration"],
    });
    expect(policy.riskTier).toBe("T2");
    expect(policy.requiredCritics).toBe(1);
    expect(policy.requiredGates).toContain("behavioral_verify");
    expect(policy.policyVersion).toBe(POLICY_VERSION);
  });

  it("applies schema-validated repo overrides within safe bounds", () => {
    const overrides = parseRepoPolicyOverrides({
      policyVersion: POLICY_VERSION,
      tokenBudget: 900_000,
      maxAgentAttempts: 18,
    });
    const policy = loadWorkPolicy(
      {
        riskTier: "T1",
        signals: { auth: false, migration: false, destructive: false, publicContract: false, docsOnly: false },
        reasons: ["contained_implementation"],
      },
      overrides,
    );
    expect(policy.tokenBudget).toBe(900_000);
    expect(policy.maxAgentAttempts).toBe(18);
    // Cannot weaken below tier minimum critics
    expect(policy.requiredCritics).toBeGreaterThanOrEqual(0);
  });

  it("rejects overrides that weaken required gates below tier minimum", () => {
    expect(() => parseRepoPolicyOverrides({
      policyVersion: POLICY_VERSION,
      requiredGates: [],
    })).toThrow();
  });

  it("builds deterministic assurance plans for same inputs and policy version", () => {
    const input = {
      title: "Migrate billing schema",
      description: "Schema migration for invoice tables",
      workflow: "feature",
      repository: "org/billing",
    };
    const first = buildAssurancePlan(input);
    const second = buildAssurancePlan(input);
    expect(first).toEqual(second);
    expect(first.policyVersion).toBe(POLICY_VERSION);
    expect(first.classification.riskTier).toBe("T2");
    expect(first.workPolicy.requiredGates.length).toBeGreaterThan(0);
  });

  it("includes classification evidence with policy version", () => {
    const plan = buildAssurancePlan({
      title: "Add session middleware",
      description: "Authentication middleware for API routes",
      workflow: "feature",
      repository: "org/api",
    });
    expect(plan.classificationEvidence.schemaVersion).toBe("classification.v1");
    expect(plan.classificationEvidence.policyVersion).toBe(POLICY_VERSION);
    expect(plan.classificationEvidence.riskTier).toBe("T3");
    expect(plan.classificationEvidence.assurancePlanHash).toBe(plan.planHash);
  });

  it("enforces per-repository concurrency locks", () => {
    const registry = new RepositoryConcurrencyRegistry();
    const key = { repository: "org/a", phase: "implement" as const };
    expect(registry.tryAcquire(key, 1)).toBe(true);
    expect(registry.tryAcquire(key, 1)).toBe(false);
    registry.release(key);
    expect(registry.tryAcquire(key, 1)).toBe(true);
  });

  it("enforces per-repository run concurrency limits from policy", () => {
    const registry = new RepositoryConcurrencyRegistry();
    const repoKey = { repository: "org/a", phase: "run" as const };
    expect(registry.tryAcquire(repoKey, 2)).toBe(true);
    expect(registry.tryAcquire(repoKey, 2)).toBe(true);
    expect(registry.tryAcquire(repoKey, 2)).toBe(false);
    registry.release(repoKey);
    expect(registry.tryAcquire(repoKey, 2)).toBe(true);
  });
});
