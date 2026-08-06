import { describe, expect, it } from "vitest";
import { classifyRisk, detectRiskSignals } from "../../src/policy/risk-classifier.js";

describe("risk classifier", () => {
  it("detects auth-related work as high risk", () => {
    const signals = detectRiskSignals({
      title: "Add OAuth login",
      description: "Implement authentication for the public API",
      workflow: "feature",
    });
    expect(signals.auth).toBe(true);

    const result = classifyRisk({
      title: "Add OAuth login",
      description: "Implement authentication for the public API",
      workflow: "feature",
    });
    expect(result.riskTier).toBe("T3");
    expect(result.reasons).toContain("auth_surface_change");
  });

  it("detects destructive migrations as T3", () => {
    const result = classifyRisk({
      title: "Drop legacy users table",
      description: "Run destructive migration to remove deprecated schema",
      workflow: "feature",
    });
    expect(result.riskTier).toBe("T3");
    expect(result.reasons).toContain("destructive_change");
  });

  it("detects migrations and public contracts as T2", () => {
    const migration = classifyRisk({
      title: "Add user preferences column",
      description: "Schema migration for new preferences table",
      workflow: "feature",
    });
    expect(migration.riskTier).toBe("T2");
    expect(migration.reasons).toContain("schema_migration");

    const contract = classifyRisk({
      title: "Update OpenAPI contract",
      description: "Public API breaking change for v2 endpoints",
      workflow: "feature",
    });
    expect(contract.riskTier).toBe("T2");
    expect(contract.reasons).toContain("public_contract_change");
  });

  it("classifies documentation work as T0", () => {
    const result = classifyRisk({
      title: "Update README",
      description: "Documentation only, no code changes",
      workflow: "docs",
    });
    expect(result.riskTier).toBe("T0");
    expect(result.reasons).toContain("documentation_only");
  });

  it("defaults contained implementation to T1", () => {
    const result = classifyRisk({
      title: "Fix button spacing",
      description: "Adjust padding in the settings panel component",
      workflow: "feature",
    });
    expect(result.riskTier).toBe("T1");
    expect(result.reasons).toContain("contained_implementation");
  });

  it("is deterministic for the same immutable inputs", () => {
    const input = {
      title: "Add billing webhook",
      description: "Handle Stripe events in billing module",
      workflow: "feature",
    };
    const first = classifyRisk(input);
    const second = classifyRisk(input);
    expect(first).toEqual(second);
  });
});
