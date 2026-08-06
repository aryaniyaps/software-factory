import { describe, expect, it } from "vitest";
import {
  buildProbeRunRecord,
  buildProbeSuiteResult,
  compareProbeDistributions,
  decideProbeSuiteOutcome,
  DEFAULT_PROBE_COMPARISON_POLICY,
} from "../../src/probes/comparator.js";
import type { ProbeAttemptMetrics, ProbeDefinition } from "../../src/probes/types.js";

const probe: ProbeDefinition = {
  schemaVersion: "probe.v1",
  id: "PRB-COMPARE",
  title: "Compare probe",
  requirement: "Add a provider adapter behind the checkout port.",
  difficulty: 5,
  acceptance: ["AC-PROBE-COMPARE"],
  adapter: { command: "test", args: ["-f", "provider.marker"] },
  repeats: 3,
  maxVariance: 0.05,
  startingMarkers: {
    baseline: ["checkout.port"],
    candidate: ["checkout.port"],
  },
};

function metrics(
  revision: "baseline" | "candidate",
  repeatIndex: number,
  success: boolean,
  wallTimeMs: number,
  dispersion: number,
): ProbeAttemptMetrics {
  return {
    schemaVersion: "probe-attempt.v1",
    probeId: probe.id,
    attemptId: "attempt-1",
    revision,
    repeatIndex,
    success,
    wallTimeMs,
    tokens: 1_000 + repeatIndex * 100,
    agentAttempts: 1,
    filesTouched: success ? 2 : 4,
    modulesTouched: success ? 1 : 2,
    symbolsTouched: success ? 3 : 6,
    dispersion,
    publicApiGrowth: success ? 0 : 1,
    regressions: success ? 0 : 1,
    contextBytes: 4_096,
    adapterOutput: { exitCode: success ? 0 : 1, stdout: "", stderr: "" },
  };
}

describe("probe comparator", () => {
  it("excludes invalid and noisy probes so they cannot fail a candidate", () => {
    const invalid = buildProbeRunRecord({
      probe,
      attemptId: "attempt-invalid",
      status: "invalid",
      baselineRepeats: [],
      candidateRepeats: [],
      exclusionReason: "missing adapter",
    });
    const noisy = buildProbeRunRecord({
      probe: { ...probe, id: "PRB-NOISY" },
      attemptId: "attempt-noisy",
      status: "noisy",
      baselineRepeats: [metrics("baseline", 0, true, 100, 0)],
      candidateRepeats: [
        metrics("candidate", 0, true, 100, 0),
        metrics("candidate", 1, false, 100, 0),
      ],
      exclusionReason: "variance exceeded threshold",
    });

    expect(decideProbeSuiteOutcome([invalid, noisy])).toBe("pass");
    const suite = buildProbeSuiteResult([invalid, noisy], ["ev-excluded"]);
    expect(suite.decision).toBe("pass");
    expect(suite.excludedProbeIds).toEqual(["PRB-COMPARE", "PRB-NOISY"]);
  });

  it("passes when candidate regression is below effect-size and confidence thresholds", () => {
    const baselineRepeats = [
      metrics("baseline", 0, true, 100, 0.1),
      metrics("baseline", 1, true, 110, 0.1),
      metrics("baseline", 2, true, 105, 0.1),
    ];
    const candidateRepeats = [
      metrics("candidate", 0, true, 115, 0.12),
      metrics("candidate", 1, true, 120, 0.11),
      metrics("candidate", 2, true, 118, 0.1),
    ];
    const comparison = compareProbeDistributions(
      probe,
      baselineRepeats,
      candidateRepeats,
      DEFAULT_PROBE_COMPARISON_POLICY,
    );
    expect(comparison.regressionDetected).toBe(false);
    expect(comparison.confidence).toBeGreaterThan(0);

    const record = buildProbeRunRecord({
      probe,
      attemptId: "attempt-pass",
      status: "succeeded",
      baselineRepeats,
      candidateRepeats,
      comparison,
    });
    expect(buildProbeSuiteResult([record], ["ev-pass"]).decision).toBe("pass");
  });

  it("fails with reproducible evidence when regression exceeds configured thresholds", () => {
    const baselineRepeats = [
      metrics("baseline", 0, true, 100, 0.1),
      metrics("baseline", 1, true, 100, 0.1),
      metrics("baseline", 2, true, 100, 0.1),
    ];
    const candidateRepeats = [
      metrics("candidate", 0, false, 250, 0.8),
      metrics("candidate", 1, false, 260, 0.85),
      metrics("candidate", 2, false, 255, 0.82),
    ];
    const comparison = compareProbeDistributions(
      probe,
      baselineRepeats,
      candidateRepeats,
      DEFAULT_PROBE_COMPARISON_POLICY,
    );
    expect(comparison.regressionDetected).toBe(true);
    expect(comparison.effectSize).toBeGreaterThanOrEqual(DEFAULT_PROBE_COMPARISON_POLICY.minEffectSize);
    expect(comparison.confidence).toBeGreaterThanOrEqual(DEFAULT_PROBE_COMPARISON_POLICY.minConfidence);
    expect(comparison.evidenceRefs.length).toBeGreaterThan(0);

    const record = buildProbeRunRecord({
      probe,
      attemptId: "attempt-fail",
      status: "failed",
      baselineRepeats,
      candidateRepeats,
      comparison,
    });
    const suite = buildProbeSuiteResult([record], comparison.evidenceRefs);
    expect(suite.decision).toBe("fail");
    expect(suite.regressionEvidenceRefs.length).toBeGreaterThan(0);
    expect(suite.runs[0]?.comparison?.evidenceRefs).toEqual(comparison.evidenceRefs);
  });
});
