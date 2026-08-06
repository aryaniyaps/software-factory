import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { assertProbeCodeNeverMergeable } from "./bank.js";
import {
  buildProbeRunRecord,
  classifyProbeVariance,
  compareProbeDistributions,
  DEFAULT_PROBE_COMPARISON_POLICY,
} from "./comparator.js";
import {
  validateProbe,
  type ProbeHiddenTestResult,
  type ProbeValidationContext,
} from "./validator.js";
import type {
  ProbeAgentConfig,
  ProbeAttemptMetrics,
  ProbeDefinition,
  ProbeRunRecord,
} from "./types.js";

export interface ProbeWorktreeInput {
  readonly repository: string;
  readonly revision: "baseline" | "candidate";
  readonly runId: string;
  readonly probeId: string;
  readonly attemptId: string;
  readonly repeatIndex: number;
}

export interface ProbeWorktree {
  readonly path: string;
  readonly branch: string;
}

export interface ProbeWorktreeManager {
  create(input: ProbeWorktreeInput): Promise<ProbeWorktree>;
  remove(path: string): Promise<void>;
}

export interface ProbeAgentExecutionInput {
  readonly revision: "baseline" | "candidate";
  readonly worktreePath: string;
  readonly probe: ProbeDefinition;
  readonly config: ProbeAgentConfig;
  readonly repeatIndex: number;
}

export interface ProbeAgentExecutionResult {
  readonly success: boolean;
  readonly wallTimeMs: number;
  readonly tokens: number;
  readonly agentAttempts: number;
  readonly filesTouched: number;
  readonly modulesTouched: number;
  readonly symbolsTouched: number;
  readonly dispersion: number;
  readonly publicApiGrowth: number;
  readonly regressions: number;
  readonly contextBytes: number;
}

export interface ProbeRunnerDependencies {
  readonly executeAgent: (input: ProbeAgentExecutionInput) => Promise<ProbeAgentExecutionResult>;
  readonly runHiddenTest: (worktreePath: string, probe: ProbeDefinition) => Promise<ProbeHiddenTestResult>;
  readonly worktreeManager: ProbeWorktreeManager;
}

export interface ProbeRunInput {
  readonly runId: string;
  readonly attemptId: string;
  readonly probe: ProbeDefinition;
  readonly baselineRoot: string;
  readonly candidateRoot: string;
  readonly agentConfig: ProbeAgentConfig;
  readonly candidateDiffSummary: string;
}

export interface ProbeRunOutput {
  readonly record: ProbeRunRecord;
  readonly destroyedWorktrees: readonly string[];
}

export class InMemoryProbeWorktreeManager implements ProbeWorktreeManager {
  private readonly created = new Map<string, string>();

  constructor(private readonly tempRoot: string) {}

  async create(input: ProbeWorktreeInput): Promise<ProbeWorktree> {
    const path = join(
      this.tempRoot,
      `${input.runId}-${input.probeId}-${input.revision}-${input.repeatIndex}`,
    );
    const source = input.revision === "baseline"
      ? this.created.get(`baseline:${input.runId}`) ?? input.repository
      : this.created.get(`candidate:${input.runId}`) ?? input.repository;
    await mkdir(path, { recursive: true });
    await cp(source, path, { recursive: true, force: true });
    this.created.set(path, source);
    return {
      path,
      branch: `probe/${input.runId}/${input.probeId}/${input.revision}/${input.repeatIndex}`,
    };
  }

  registerRevisionRoot(runId: string, revision: "baseline" | "candidate", root: string): void {
    this.created.set(`${revision}:${runId}`, root);
  }

  async remove(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
    this.created.delete(path);
  }
}

export class ProbeRunner {
  constructor(private readonly deps: ProbeRunnerDependencies) {}

  private validationContext(
    input: ProbeRunInput,
  ): ProbeValidationContext {
    return {
      baselineRoot: input.baselineRoot,
      candidateRoot: input.candidateRoot,
      candidateDiffSummary: input.candidateDiffSummary,
      hiddenTest: (root, probe) => this.deps.runHiddenTest(root, probe),
    };
  }

  private async runRevisionRepeats(
    input: ProbeRunInput,
    revision: "baseline" | "candidate",
    repository: string,
    repeats: number,
    destroyedWorktrees: string[],
  ): Promise<ProbeAttemptMetrics[]> {
    const metrics: ProbeAttemptMetrics[] = [];
    for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
      const worktree = await this.deps.worktreeManager.create({
        repository,
        revision,
        runId: input.runId,
        probeId: input.probe.id,
        attemptId: input.attemptId,
        repeatIndex,
      });
      try {
        const agentResult = await this.deps.executeAgent({
          revision,
          worktreePath: worktree.path,
          probe: input.probe,
          config: input.agentConfig,
          repeatIndex,
        });
        const adapterOutput = await this.deps.runHiddenTest(worktree.path, input.probe);
        metrics.push({
          schemaVersion: "probe-attempt.v1",
          probeId: input.probe.id,
          attemptId: input.attemptId,
          revision,
          repeatIndex,
          success: agentResult.success && adapterOutput.exitCode === 0,
          wallTimeMs: agentResult.wallTimeMs,
          tokens: agentResult.tokens,
          agentAttempts: agentResult.agentAttempts,
          filesTouched: agentResult.filesTouched,
          modulesTouched: agentResult.modulesTouched,
          symbolsTouched: agentResult.symbolsTouched,
          dispersion: agentResult.dispersion,
          publicApiGrowth: agentResult.publicApiGrowth,
          regressions: agentResult.regressions,
          contextBytes: agentResult.contextBytes,
          adapterOutput,
        });
      } finally {
        await this.deps.worktreeManager.remove(worktree.path);
        destroyedWorktrees.push(worktree.path);
      }
    }
    return metrics;
  }

  async runProbe(input: ProbeRunInput): Promise<ProbeRunOutput> {
    const destroyedWorktrees: string[] = [];
    const validation = await validateProbe(input.probe, this.validationContext(input));
    if (validation.status !== "valid") {
      const record = buildProbeRunRecord({
        probe: input.probe,
        attemptId: input.attemptId,
        status: validation.status === "noisy"
          ? "noisy"
          : validation.status === "invalid"
            ? "invalid"
            : "excluded",
        baselineRepeats: [],
        candidateRepeats: [],
        exclusionReason: validation.reason,
      });
      assertProbeCodeNeverMergeable(record.mergeable);
      return { record, destroyedWorktrees };
    }

    const repeats = input.probe.repeats ?? 1;
    const baselineRepeats = await this.runRevisionRepeats(
      input,
      "baseline",
      input.baselineRoot,
      repeats,
      destroyedWorktrees,
    );
    const candidateRepeats = await this.runRevisionRepeats(
      input,
      "candidate",
      input.candidateRoot,
      repeats,
      destroyedWorktrees,
    );

    const variance = classifyProbeVariance(input.probe, baselineRepeats, candidateRepeats);
    if (variance.noisy) {
      const record = buildProbeRunRecord({
        probe: input.probe,
        attemptId: input.attemptId,
        status: "noisy",
        baselineRepeats,
        candidateRepeats,
        exclusionReason: "probe run variance exceeds configured threshold",
      });
      assertProbeCodeNeverMergeable(record.mergeable);
      return { record, destroyedWorktrees };
    }

    const comparison = compareProbeDistributions(
      input.probe,
      baselineRepeats,
      candidateRepeats,
      DEFAULT_PROBE_COMPARISON_POLICY,
    );
    const record = buildProbeRunRecord({
      probe: input.probe,
      attemptId: input.attemptId,
      status: comparison.regressionDetected ? "failed" : "succeeded",
      baselineRepeats,
      candidateRepeats,
      comparison,
    });
    assertProbeCodeNeverMergeable(record.mergeable);
    return { record, destroyedWorktrees };
  }
}
