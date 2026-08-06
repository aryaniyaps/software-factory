import { describe, expect, it } from "vitest";
import {
  buildWeatherReport,
  type ModelObservation,
} from "../../src/models/weather-report.js";
import {
  advanceCanaryRoute,
  promoteModelRoute,
  rollbackModelRoute,
  selectModelRoute,
  startShadowRoute,
  type ModelRoute,
} from "../../src/models/router.js";

function observation(
  modelId: string,
  role: string,
  taskType: string,
  riskTier: "T0" | "T1" | "T2" | "T3",
  overrides: Partial<ModelObservation> = {},
): ModelObservation {
  return {
    modelId,
    modelVersion: `${modelId}-v1`,
    role,
    taskType,
    riskTier,
    successRate: 0.8,
    avgCost: 10_000,
    variance: 0.1,
    incidentRate: 0.05,
    maintainabilityEffect: 1,
    sampleCount: 25,
    evidenceVersion: "evidence.v1",
    ...overrides,
  };
}

describe("empirical model routing", () => {
  it("routes models by role, task and risk using evidence rather than hardcoded rankings", () => {
    const report = buildWeatherReport("weather.v1", [
      observation("model-a", "implement", "feature", "T1", { successRate: 0.7, avgCost: 12_000 }),
      observation("model-b", "implement", "feature", "T1", { successRate: 0.9, avgCost: 9_000, variance: 0.05 }),
      observation("model-c", "review", "feature", "T2", { successRate: 0.95, avgCost: 4_000 }),
    ]);

    const route = selectModelRoute(report, {
      role: "implement",
      taskType: "feature",
      riskTier: "T1",
    });

    expect(route.modelId).toBe("model-b");
    expect(route.evidenceVersion).toBe("evidence.v1");
    expect(route.evidenceScore).toBeGreaterThan(0);
    expect(route.selectionReason).toMatch(/evidence/i);
  });

  it("includes versioned empirical evidence and rollback on promotion", () => {
    const current: ModelRoute = {
      role: "implement",
      taskType: "feature",
      riskTier: "T1",
      modelId: "model-a",
      modelVersion: "model-a-v1",
      routeVersion: "route.v1",
      evidenceVersion: "evidence.v1",
      evidenceScore: 0.7,
    };

    const candidate: ModelRoute = {
      ...current,
      modelId: "model-b",
      modelVersion: "model-b-v2",
      routeVersion: "route.v2",
      evidenceVersion: "evidence.v2",
      evidenceScore: 0.86,
      shadowScore: 0.84,
    };

    const shadowed = startShadowRoute(current, candidate);
    expect(shadowed.shadowModelId).toBe("model-b");
    expect(shadowed.canaryPercentage).toBe(0);

    const canaried = advanceCanaryRoute(shadowed, 10);
    expect(canaried.canaryPercentage).toBe(10);

    const promoted = promoteModelRoute({
      current,
      candidate: canaried,
      evaluatorId: "routing-evaluator",
      candidateEvaluatorId: "model-b",
      minImprovement: 0.05,
    });

    expect(promoted.promoted).toBe(true);
    expect(promoted.route.routeVersion).toBe("route.v2");
    expect(promoted.route.evidenceRefs).toContain("evidence.v2");

    const rolledBack = rollbackModelRoute(promoted.route, current);
    expect(rolledBack.modelId).toBe("model-a");
    expect(rolledBack.routeVersion).toBe("route.v1");
  });

  it("rejects model route promotion when the candidate evaluator is the same identity", () => {
    const current: ModelRoute = {
      role: "review",
      taskType: "bugfix",
      riskTier: "T2",
      modelId: "model-a",
      modelVersion: "model-a-v1",
      routeVersion: "route.v1",
      evidenceVersion: "evidence.v1",
      evidenceScore: 0.75,
    };
    const candidate: ModelRoute = {
      ...current,
      modelId: "model-a",
      modelVersion: "model-a-v2",
      routeVersion: "route.v2",
      evidenceVersion: "evidence.v2",
      evidenceScore: 0.95,
      shadowScore: 0.94,
    };

    const decision = promoteModelRoute({
      current,
      candidate,
      evaluatorId: "model-a",
      candidateEvaluatorId: "model-a",
      minImprovement: 0.01,
    });

    expect(decision.promoted).toBe(false);
    expect(decision.reason).toMatch(/self-promotion/i);
  });
});
