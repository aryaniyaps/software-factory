import { describe, expect, it } from "vitest";
import {
  compareThresholdVersions,
  evaluateOracleVersion,
  preventsSelfPromotion,
  promoteThresholdVersion,
} from "../../src/assurance/calibration.js";

function sample(releaseId: string, predicted: number, actual: number) {
  return {
    prediction: { releaseId, predictedRisk: predicted, oracleVersion: "oracle-v1" },
    outcome: { releaseId, actualCost: actual },
  };
}

describe("oracle calibration", () => {
  it("evaluates oracle versions on held-out history", () => {
    const samples = [
      sample("r1", 0.9, 0.95),
      sample("r2", 0.2, 0.1),
      sample("r3", 0.8, 0.7),
      sample("r4", 0.3, 0.4),
      sample("r5", 0.6, 0.55),
      sample("r6", 0.1, 0.2),
    ];

    const result = evaluateOracleVersion(samples, { holdOutRatio: 0.34, seed: 7 });
    expect(result.samples).toBe(6);
    expect(result.holdOutScore).toBeGreaterThan(0);
    expect(result.holdOutScore).toBeLessThanOrEqual(1);
    expect(result.trainScore).toBeGreaterThan(0);
    expect(result.heldOutReleaseIds.length).toBeGreaterThan(0);
  });

  it("requires held-out evidence before threshold promotion", () => {
    const current = {
      version: "thresholds.v1",
      thresholds: { "git-hotspot": 50 },
      evidenceScore: 0.62,
      heldOutScore: 0.6,
    };
    const worse = {
      version: "thresholds.v2",
      thresholds: { "git-hotspot": 40 },
      evidenceScore: 0.7,
      heldOutScore: 0.55,
    };
    const better = {
      version: "thresholds.v3",
      thresholds: { "git-hotspot": 45 },
      evidenceScore: 0.68,
      heldOutScore: 0.66,
    };

    expect(compareThresholdVersions(current, worse).improves).toBe(false);
    expect(compareThresholdVersions(current, better).improves).toBe(true);
    expect(compareThresholdVersions(current, better).evidence).toMatch(/held-out/i);
  });

  it("prevents evaluator self-promotion", () => {
    expect(preventsSelfPromotion("maintainability-oracle", "maintainability-oracle")).toBe(true);
    expect(preventsSelfPromotion("maintainability-oracle", "release-oracle")).toBe(false);
  });

  it("rejects promotion when the candidate oracle graded itself", () => {
    const decision = promoteThresholdVersion({
      current: {
        version: "thresholds.v1",
        thresholds: { "git-hotspot": 50 },
        evidenceScore: 0.6,
        heldOutScore: 0.58,
      },
      candidate: {
        version: "thresholds.v2",
        thresholds: { "git-hotspot": 45 },
        evidenceScore: 0.9,
        heldOutScore: 0.88,
        shadowScore: 0.87,
      },
      evaluatorOracleId: "maintainability-oracle",
      candidateOracleId: "maintainability-oracle",
      heldOutImprovement: 0.3,
    });

    expect(decision.promoted).toBe(false);
    expect(decision.reason).toMatch(/self-promotion/i);
  });

  it("promotes only when held-out and shadow evidence improve prediction", () => {
    const decision = promoteThresholdVersion({
      current: {
        version: "thresholds.v1",
        thresholds: { "git-hotspot": 50 },
        evidenceScore: 0.6,
        heldOutScore: 0.58,
      },
      candidate: {
        version: "thresholds.v2",
        thresholds: { "git-hotspot": 45 },
        evidenceScore: 0.68,
        heldOutScore: 0.66,
        shadowScore: 0.65,
      },
      evaluatorOracleId: "release-oracle",
      candidateOracleId: "maintainability-oracle",
      heldOutImprovement: 0.08,
      minImprovement: 0.05,
    });

    expect(decision.promoted).toBe(true);
    expect(decision.version).toBe("thresholds.v2");
  });
});
