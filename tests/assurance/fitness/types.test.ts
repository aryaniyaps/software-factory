import { describe, expect, it } from "vitest";
import { parseFitnessPolicy } from "../../../src/assurance/fitness/policy.js";
import { supportsTypeScript } from "../../../src/assurance/fitness/types.js";
import { pythonContext, typescriptContext } from "./helpers.js";

describe("fitness types", () => {
  it("detects typescript repository support", () => {
    expect(supportsTypeScript(typescriptContext)).toBe(true);
    expect(supportsTypeScript(pythonContext)).toBe(false);
  });

  it("rejects invalid policy documents", () => {
    expect(() => parseFitnessPolicy({ schemaVersion: "bad" })).toThrow();
    expect(() => parseFitnessPolicy({
      schemaVersion: "fitness-policy.v1",
      policyVersion: "v1",
      shadowMode: { enabled: true, successfulRunsRemaining: 30 },
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
      requiredCapabilities: ["unknown_capability"],
      hardRuleIds: [],
      shadowRuleIds: [],
      adapters: {},
    })).toThrow();
  });
});
