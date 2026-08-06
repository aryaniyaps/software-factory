import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadProbeBankFromRoot } from "../../src/probes/bank.js";
import { ProbeRunner } from "../../src/probes/runner.js";
import type { ProbeAgentConfig, ProbeDefinition } from "../../src/probes/types.js";

async function createRevisionRoots(): Promise<{ baselineRoot: string; candidateRoot: string }> {
  const baselineRoot = await mkdtemp(join(tmpdir(), "sf-probe-base-"));
  const candidateRoot = await mkdtemp(join(tmpdir(), "sf-probe-cand-"));
  await writeFile(join(baselineRoot, "checkout.port"), "ok\n");
  await writeFile(join(candidateRoot, "checkout.port"), "ok\n");
  await writeFile(join(candidateRoot, "provider.marker"), "enabled\n");
  return { baselineRoot, candidateRoot };
}

async function markerExists(root: string, marker: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(join(root, marker));
    return true;
  } catch {
    return false;
  }
}

const agentConfig: ProbeAgentConfig = {
  model: "test-model",
  toolPolicyVersion: "tools.v1",
  tokenBudget: 50_000,
  wallClockBudgetMs: 60_000,
  promptVersion: "probe-agent.v1",
};

describe("probe runner", () => {
  it("loads hidden probes for the verifier role", async () => {
    const root = new URL("./fixtures/hidden-probes", import.meta.url).pathname;
    const bank = await loadProbeBankFromRoot(root, { hiddenRoot: root, role: "probe_verifier" });
    expect(bank.bankVersion).toBe("probe-bank.v1");
    expect(bank.probes.map((probe) => probe.id)).toEqual([
      "PRB-ADD-PROVIDER",
      "PRB-ALREADY-DONE",
      "PRB-LEAKED",
      "PRB-NOISY",
      "PRB-UNEQUAL",
    ]);
  });

  it("runs identical agent config on base and candidate and records metrics", async () => {
    const { baselineRoot, candidateRoot } = await createRevisionRoots();
    const root = new URL("./fixtures/hidden-probes", import.meta.url).pathname;
    const bank = await loadProbeBankFromRoot(root, { hiddenRoot: root, role: "probe_verifier" });
    const probe = bank.probes.find((entry) => entry.id === "PRB-ADD-PROVIDER") as ProbeDefinition;

    const configs: ProbeAgentConfig[] = [];
    const runner = new ProbeRunner({
      executeAgent: async (input) => {
        configs.push(input.config);
        const marker = probe.adapter.args?.[1] ?? "";
        await writeFile(join(input.worktreePath, marker), "enabled\n");
        return {
          success: true,
          wallTimeMs: input.revision === "candidate" ? 120 : 100,
          tokens: 1_500,
          agentAttempts: 1,
          filesTouched: 2,
          modulesTouched: 1,
          symbolsTouched: 3,
          dispersion: 0.2,
          publicApiGrowth: 0,
          regressions: 0,
          contextBytes: 2_048,
        };
      },
      runHiddenTest: async (worktreePath, definition) => {
        const marker = definition.adapter.args?.[1] ?? "";
        const exists = await markerExists(worktreePath, marker);
        return { exitCode: exists ? 0 : 1, stdout: "", stderr: "" };
      },
      worktreeManager: {
        async create(input) {
          const path = await mkdtemp(join(tmpdir(), `probe-${input.revision}-`));
          return { path, branch: `probe/${input.revision}` };
        },
        async remove(path) {
          const { rm } = await import("node:fs/promises");
          await rm(path, { recursive: true, force: true });
        },
      },
    });

    const { record, destroyedWorktrees } = await runner.runProbe({
      runId: "run-1",
      attemptId: "attempt-1",
      probe,
      baselineRoot,
      candidateRoot,
      agentConfig,
      candidateDiffSummary: "adds provider.marker",
    });

    expect(configs).toHaveLength(4);
    expect(configs.every((config) => config.model === agentConfig.model)).toBe(true);
    expect(configs.every((config) => config.promptVersion === agentConfig.promptVersion)).toBe(true);
    expect(record.baselineRepeats).toHaveLength(2);
    expect(record.candidateRepeats).toHaveLength(2);
    expect(record.baselineRepeats.every((repeat) => repeat.success)).toBe(true);
    expect(record.candidateRepeats.every((repeat) => repeat.success)).toBe(true);
    expect(destroyedWorktrees).toHaveLength(4);
    expect(record.mergeable).toBe(false);
  });

  it("destroys probe worktrees under all outcomes", async () => {
    const { baselineRoot, candidateRoot } = await createRevisionRoots();
    const probe: ProbeDefinition = {
      schemaVersion: "probe.v1",
      id: "PRB-DESTROY",
      title: "Destroy worktrees",
      requirement: "Add provider support without leaking implementation details.",
      difficulty: 4,
      acceptance: ["AC-DESTROY"],
      adapter: { command: "test", args: ["-f", "missing.marker"] },
      repeats: 1,
      startingMarkers: { baseline: ["checkout.port"], candidate: ["checkout.port"] },
    };

    const created: string[] = [];
    const destroyed: string[] = [];
    const runner = new ProbeRunner({
      executeAgent: async () => ({
        success: false,
        wallTimeMs: 50,
        tokens: 500,
        agentAttempts: 1,
        filesTouched: 1,
        modulesTouched: 1,
        symbolsTouched: 1,
        dispersion: 0.5,
        publicApiGrowth: 0,
        regressions: 1,
        contextBytes: 1_024,
      }),
      runHiddenTest: async () => ({ exitCode: 1, stdout: "", stderr: "missing" }),
      worktreeManager: {
        async create(input) {
          const path = await mkdtemp(join(tmpdir(), `probe-${input.revision}-`));
          created.push(path);
          return { path, branch: `probe/${input.revision}` };
        },
        async remove(path) {
          destroyed.push(path);
          const { rm } = await import("node:fs/promises");
          await rm(path, { recursive: true, force: true });
        },
      },
    });

    const { record, destroyedWorktrees } = await runner.runProbe({
      runId: "run-2",
      attemptId: "attempt-2",
      probe,
      baselineRoot,
      candidateRoot,
      agentConfig,
      candidateDiffSummary: "candidate diff",
    });

    expect(created).toHaveLength(2);
    expect(destroyed).toEqual(created);
    expect(destroyedWorktrees).toEqual(created);
    expect(record.mergeable).toBe(false);
    expect(record.status).toBe("succeeded");
  });
});
