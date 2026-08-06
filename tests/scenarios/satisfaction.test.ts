import { describe, expect, it } from "vitest";
import {
  buildScenarioRunRecord,
  buildSuiteResult,
  classifyScenarioRun,
  decideSuiteOutcome,
  markInvalidScenario,
} from "../../src/scenarios/satisfaction.js";
import type { ScenarioDefinition, ScenarioRepeatOutcome, ScenarioTrajectory } from "../../src/scenarios/types.js";

function trajectory(
  scenarioId: string,
  revision: "baseline" | "candidate",
  repeatIndex: number,
  satisfied: boolean,
): ScenarioTrajectory {
  return {
    schemaVersion: "scenario-trajectory.v1",
    scenarioId,
    attemptId: "attempt-1",
    revision,
    repeatIndex,
    steps: [{
      index: 0,
      action: "probe",
      outcome: satisfied ? "ok" : "error",
      timestamp: "2026-08-06T12:00:00.000Z",
    }],
    adapterOutput: { exitCode: satisfied ? 0 : 1, stdout: "", stderr: "" },
    satisfied,
  };
}

function repeat(trajectoryValue: ScenarioTrajectory): ScenarioRepeatOutcome {
  return { trajectory: trajectoryValue, satisfaction: trajectoryValue.satisfied ? 1 : 0 };
}

const behaviorScenario: ScenarioDefinition = {
  schemaVersion: "scenario.v1",
  id: "SCN-BEHAVIOR",
  title: "behavior",
  type: "api",
  mode: "behavior",
  acceptance: ["AC-ONE"],
  adapter: { command: "test", args: ["-f", "feature.marker"] },
  minSatisfaction: 0.95,
  maxVariance: 0.05,
};

describe("scenario satisfaction", () => {
  it("abstains for invalid scenarios instead of passing", () => {
    const invalid = markInvalidScenario("SCN-BAD", "attempt-1", "missing adapter");
    const suite = buildSuiteResult([invalid], ["trajectory:SCN-BAD:attempt-1:invalid"]);
    expect(suite.decision).toBe("abstain");
    expect(decideSuiteOutcome([invalid])).toBe("abstain");
  });

  it("abstains for noisy scenarios with high variance", () => {
    const noisy = classifyScenarioRun(
      { ...behaviorScenario, repeats: 4, maxVariance: 0.01 },
      [repeat(trajectory("SCN-BEHAVIOR", "baseline", 0, false))],
      [
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 0, true)),
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 1, false)),
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 2, true)),
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 3, false)),
      ],
    );
    expect(noisy.status).toBe("noisy");
    const record = buildScenarioRunRecord(
      { ...behaviorScenario, repeats: 4, maxVariance: 0.01 },
      "attempt-1",
      [repeat(trajectory("SCN-BEHAVIOR", "baseline", 0, false))],
      [
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 0, true)),
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 1, false)),
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 2, true)),
        repeat(trajectory("SCN-BEHAVIOR", "candidate", 3, false)),
      ],
    );
    expect(buildSuiteResult([record], ["ev-1"]).decision).toBe("abstain");
  });

  it("links each acceptance criterion to trajectory evidence", () => {
    const record = buildScenarioRunRecord(
      behaviorScenario,
      "attempt-1",
      [repeat(trajectory("SCN-BEHAVIOR", "baseline", 0, false))],
      [repeat(trajectory("SCN-BEHAVIOR", "candidate", 0, true))],
    );
    expect(record.acceptanceEvidence["AC-ONE"]).toEqual([
      "trajectory:SCN-BEHAVIOR:attempt-1:baseline:0",
      "trajectory:SCN-BEHAVIOR:attempt-1:candidate:0",
    ]);
    expect(record.status).toBe("succeeded");
    expect(buildSuiteResult([record], ["ev-trajectory"]).decision).toBe("pass");
  });
});
