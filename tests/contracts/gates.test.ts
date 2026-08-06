import { describe, expect, it } from "vitest";
import { parseFailureEnvelope } from "../../src/contracts/failures.js";
import { parseGateDecision } from "../../src/contracts/gates.js";

describe("gate and failure contracts", () => {
  const reason = { code: "checks.passed", message: "all checks passed" };
  const evidenceRefs = ["ev-checks"];

  it("accepts pass, fail, and abstain decisions", () => {
    for (const decision of ["pass", "fail", "abstain"] as const) {
      expect(parseGateDecision({ schemaVersion: "gate.v1", gateId: "checks", decision, policyVersion: "policy-1", reasons: [reason], evidenceRefs }).decision).toBe(decision);
    }
  });

  it("requires evidence and rejects invalid decisions", () => {
    expect(() => parseGateDecision({ schemaVersion: "gate.v1", gateId: "checks", decision: "maybe", policyVersion: "policy-1", reasons: [reason], evidenceRefs })).toThrow();
    expect(() => parseGateDecision({ schemaVersion: "gate.v1", gateId: "checks", decision: "pass", policyVersion: "policy-1", reasons: [reason], evidenceRefs: [] })).toThrow();
  });

  it("accepts known failure classes and rejects unknown classes", () => {
    expect(parseFailureEnvelope({ schemaVersion: "failure.v1", type: "budget", code: "budget.exhausted", message: "limit reached", retryable: false, evidenceRefs })).toMatchObject({ type: "budget" });
    expect(() => parseFailureEnvelope({ schemaVersion: "failure.v1", type: "network", code: "network.down", message: "down", retryable: true, evidenceRefs })).toThrow();
  });
});
