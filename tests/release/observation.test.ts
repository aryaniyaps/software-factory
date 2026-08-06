import { describe, expect, it } from "vitest";
import {
  DEFAULT_OBSERVATION_POLICY,
  evaluateObservation,
  healthAloneCannotPromote,
} from "../../src/release/observation.js";

describe("release observation", () => {
  const policy = DEFAULT_OBSERVATION_POLICY;

  it("passes when technical SLOs and semantic checks succeed", () => {
    const result = evaluateObservation({
      policy,
      technical: { healthOk: true, errorRate: 0.001, latencyP99Ms: 120 },
      semantic: { productChecksPassed: true, sloBreaches: [] },
    });
    expect(result.decision).toBe("pass");
    expect(result.reasons).toEqual([]);
  });

  it("fails when semantic product checks fail even if health is ok", () => {
    const result = evaluateObservation({
      policy,
      technical: { healthOk: true, errorRate: 0.001, latencyP99Ms: 120 },
      semantic: { productChecksPassed: false, sloBreaches: ["checkout-success-rate"] },
    });
    expect(result.decision).toBe("fail");
    expect(result.reasons).toContain("semantic_check_failed");
  });

  it("fails when technical SLO thresholds are breached", () => {
    const result = evaluateObservation({
      policy,
      technical: { healthOk: true, errorRate: 0.2, latencyP99Ms: 120 },
      semantic: { productChecksPassed: true, sloBreaches: [] },
    });
    expect(result.decision).toBe("fail");
    expect(result.reasons).toContain("error_rate_exceeded");
  });

  it("treats health endpoint alone as insufficient for promotion", () => {
    expect(healthAloneCannotPromote({
      policy,
      technical: { healthOk: true, errorRate: 0, latencyP99Ms: 0 },
      semantic: { productChecksPassed: false, sloBreaches: [] },
    })).toBe(true);
    expect(healthAloneCannotPromote({
      policy,
      technical: { healthOk: true, errorRate: 0.001, latencyP99Ms: 100 },
      semantic: { productChecksPassed: true, sloBreaches: [] },
    })).toBe(false);
  });

  it("returns insufficient when required semantic evidence is missing", () => {
    const result = evaluateObservation({
      policy,
      technical: { healthOk: true, errorRate: 0.001, latencyP99Ms: 120 },
      semantic: { productChecksPassed: false, sloBreaches: [], evidenceMissing: true },
    });
    expect(result.decision).toBe("insufficient");
  });
});
