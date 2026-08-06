import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadScenariosFromRoot } from "../../src/scenarios/loader.js";
import { ScenarioRunner, createMockProcessRunner } from "../../src/scenarios/runner.js";
import type { ProcessSpec } from "../../src/assurance/fitness/process-runner.js";

async function createRevisionRoots(): Promise<{ baselineRoot: string; candidateRoot: string }> {
  const baselineRoot = await mkdtemp(join(tmpdir(), "sf-baseline-"));
  const candidateRoot = await mkdtemp(join(tmpdir(), "sf-candidate-"));
  await writeFile(join(candidateRoot, "feature.marker"), "enabled\n");
  await writeFile(join(baselineRoot, "stable.marker"), "ok\n");
  await writeFile(join(candidateRoot, "stable.marker"), "ok\n");
  return { baselineRoot, candidateRoot };
}

describe("scenario runner", () => {
  it("loads hidden scenarios for the verifier role", async () => {
    const root = new URL("./fixtures/hidden-scenarios", import.meta.url).pathname;
    const scenarios = await loadScenariosFromRoot(root, { hiddenRoot: root, role: "behavior_verifier" });
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "SCN-BEHAVIOR-API",
      "SCN-REFACTOR-CLI",
      "SCN-NOISY-PERF",
    ]);
  });

  it("fails behavior scenarios on baseline and passes on candidate", async () => {
    const { baselineRoot, candidateRoot } = await createRevisionRoots();
    const root = new URL("./fixtures/hidden-scenarios", import.meta.url).pathname;
    const scenarios = await loadScenariosFromRoot(root, { hiddenRoot: root, role: "behavior_verifier" });
    const behavior = scenarios.find((scenario) => scenario.id === "SCN-BEHAVIOR-API");
    expect(behavior).toBeDefined();

    const runner = new ScenarioRunner({
      runner: createMockProcessRunner(async (spec: ProcessSpec) => {
        const marker = spec.args?.[1] ?? "";
        const exists = await fileExists(join(spec.cwd, marker));
        return { exitCode: exists ? 0 : 1, stdout: "", stderr: "", timedOut: false, outputTruncated: false };
      }),
    });

    const { record } = await runner.runScenario(behavior!, {
      runId: "run-1",
      attemptId: "attempt-1",
      baselineRoot,
      candidateRoot,
      scenarios: [behavior!],
    });

    expect(record.status).toBe("succeeded");
    expect(record.satisfied).toBe(true);
    expect(record.acceptanceEvidence["AC-FEATURE-MARKER"]?.length).toBeGreaterThan(0);
  });

  it("passes refactor scenarios on both baseline and candidate", async () => {
    const { baselineRoot, candidateRoot } = await createRevisionRoots();
    const root = new URL("./fixtures/hidden-scenarios", import.meta.url).pathname;
    const scenarios = await loadScenariosFromRoot(root, { hiddenRoot: root, role: "behavior_verifier" });
    const refactor = scenarios.find((scenario) => scenario.id === "SCN-REFACTOR-CLI");
    expect(refactor).toBeDefined();

    const runner = new ScenarioRunner({
      runner: createMockProcessRunner(async (spec: ProcessSpec) => {
        const marker = spec.args?.[1] ?? "";
        const exists = await fileExists(join(spec.cwd, marker));
        return { exitCode: exists ? 0 : 1, stdout: "", stderr: "", timedOut: false, outputTruncated: false };
      }),
    });

    const { record } = await runner.runScenario(refactor!, {
      runId: "run-1",
      attemptId: "attempt-1",
      baselineRoot,
      candidateRoot,
      scenarios: [refactor!],
    });

    expect(record.status).toBe("succeeded");
    expect(record.satisfied).toBe(true);
    expect(record.acceptanceEvidence["AC-STABLE-MARKER"]?.length).toBeGreaterThan(0);
  });
});

async function fileExists(path: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}
