import { createHash } from "node:crypto";
import type { ProcessOutcome, ProcessRunner, ProcessSpec } from "../assurance/fitness/process-runner.js";
import type { TwinRegistry } from "../simulation/registry.js";
import { redactFixture, stableSerializeFixture } from "../simulation/twin.js";
import {
  buildScenarioRunRecord,
  buildSuiteResult,
  markInvalidScenario,
  SCENARIO_POLICY_VERSION,
  trajectorySatisfaction,
} from "./satisfaction.js";
import type { ScenarioDefinition, ScenarioRepeatOutcome, ScenarioSuiteResult, ScenarioTrajectory } from "./types.js";
import { SCENARIO_TYPES, parseScenarioDefinition } from "./types.js";

export interface ScenarioExecutionContext {
  readonly revision: "baseline" | "candidate";
  readonly root: string;
  readonly runId: string;
  readonly attemptId: string;
}

export interface ScenarioAdapter {
  readonly type: ScenarioDefinition["type"];
  run(scenario: ScenarioDefinition, context: ScenarioExecutionContext): Promise<Pick<ScenarioTrajectory, "steps" | "adapterOutput" | "satisfied">>;
}

export interface ScenarioRunnerDependencies {
  readonly runner: ProcessRunner;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly adapters?: readonly ScenarioAdapter[];
  readonly twinRegistry?: TwinRegistry;
  readonly now?: () => string;
}

export interface ScenarioRunInput {
  readonly runId: string;
  readonly attemptId: string;
  readonly baselineRoot: string;
  readonly candidateRoot: string;
  readonly scenarios: readonly ScenarioDefinition[];
  readonly policyVersion?: string;
}

function defaultAdapters(deps: ScenarioRunnerDependencies): ScenarioAdapter[] {
  const timeoutMs = deps.timeoutMs ?? 30_000;
  const maxOutputBytes = deps.maxOutputBytes ?? 256_000;
  const now = deps.now ?? (() => new Date().toISOString());

  const commandAdapter = (type: ScenarioDefinition["type"]): ScenarioAdapter => ({
    type,
    async run(scenario, context) {
      const spec: ProcessSpec = {
        command: scenario.adapter.command,
        args: scenario.adapter.args ?? [],
        cwd: context.root,
        timeoutMs,
        maxOutputBytes,
      };
      const outcome = await deps.runner.run(spec);
      const satisfied = outcome.exitCode === 0 && !outcome.timedOut;
      return {
        steps: [{
          index: 0,
          action: `${type}:${scenario.adapter.command}`,
          outcome: satisfied ? "ok" : "error",
          detail: outcome.timedOut ? "timed out" : outcome.stderr.trim() || undefined,
          timestamp: now(),
        }],
        adapterOutput: {
          exitCode: outcome.exitCode,
          stdout: outcome.stdout,
          stderr: outcome.stderr,
        },
        satisfied,
      };
    },
  });

  return SCENARIO_TYPES.map((type) => commandAdapter(type));
}

export class ScenarioRunner {
  private readonly adapters: Map<ScenarioDefinition["type"], ScenarioAdapter>;

  constructor(private readonly deps: ScenarioRunnerDependencies) {
    const adapters = deps.adapters ?? defaultAdapters(deps);
    this.adapters = new Map(adapters.map((adapter) => [adapter.type, adapter]));
  }

  async runScenarioRepeats(
    scenario: ScenarioDefinition,
    revision: ScenarioExecutionContext["revision"],
    root: string,
    runId: string,
    attemptId: string,
  ): Promise<ScenarioRepeatOutcome[]> {
    const adapter = this.adapters.get(scenario.type);
    if (!adapter) throw new Error(`unsupported scenario type: ${scenario.type}`);
    const repeats = scenario.repeats ?? 1;
    const outcomes: ScenarioRepeatOutcome[] = [];
    for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
      const partial = await adapter.run(scenario, { revision, root, runId, attemptId });
      const trajectory: ScenarioTrajectory = {
        schemaVersion: "scenario-trajectory.v1",
        scenarioId: scenario.id,
        attemptId,
        revision,
        repeatIndex,
        ...partial,
      };
      outcomes.push({
        trajectory,
        satisfaction: trajectorySatisfaction(trajectory),
      });
    }
    return outcomes;
  }

  async runScenario(scenario: ScenarioDefinition, input: ScenarioRunInput): Promise<{
    record: ReturnType<typeof buildScenarioRunRecord>;
    trajectoryKeys: string[];
  }> {
    try {
      parseScenarioDefinition(scenario);
    } catch (error) {
      const record = markInvalidScenario(scenario.id, input.attemptId, String(error));
      return {
        record,
        trajectoryKeys: [`trajectory:${scenario.id}:${input.attemptId}:invalid`],
      };
    }

    const baselineRepeats = await this.runScenarioRepeats(
      scenario,
      "baseline",
      input.baselineRoot,
      input.runId,
      input.attemptId,
    );
    const candidateRepeats = await this.runScenarioRepeats(
      scenario,
      "candidate",
      input.candidateRoot,
      input.runId,
      input.attemptId,
    );
    const record = buildScenarioRunRecord(scenario, input.attemptId, baselineRepeats, candidateRepeats);
    const trajectoryKeys = record.trajectories.map(
      (trajectory) => trajectoryKey(trajectory),
    );
    return { record, trajectoryKeys };
  }

  async runSuite(input: ScenarioRunInput): Promise<{
    suite: ScenarioSuiteResult;
    records: ReturnType<typeof buildScenarioRunRecord>[];
  }> {
    if (this.deps.twinRegistry) {
      this.deps.twinRegistry.reset();
    }

    const runs: ReturnType<typeof buildScenarioRunRecord>[] = [];
    const evidenceRefs: string[] = [];
    for (const scenario of input.scenarios) {
      const { record, trajectoryKeys } = await this.runScenario(scenario, input);
      runs.push(record);
      evidenceRefs.push(...trajectoryKeys);
      evidenceRefs.push(`scenario-run:${record.scenarioId}:${record.attemptId}`);
    }

    if (this.deps.twinRegistry) {
      evidenceRefs.push(...buildTwinEvidenceRefs(this.deps.twinRegistry));
    }

    return {
      records: runs,
      suite: buildSuiteResult(runs, evidenceRefs, input.policyVersion ?? SCENARIO_POLICY_VERSION),
    };
  }
}

export function trajectoryKey(trajectory: ScenarioTrajectory): string {
  return `trajectory:${trajectory.scenarioId}:${trajectory.attemptId}:${trajectory.revision}:${trajectory.repeatIndex}`;
}

export function trajectoryBodyHash(trajectory: ScenarioTrajectory): string {
  return createHash("sha256").update(JSON.stringify(trajectory)).digest("hex");
}

export function buildTwinEvidenceRefs(registry: TwinRegistry): string[] {
  return registry.list().map((twin) => {
    const fixture = redactFixture(twin.exportFixture());
    const hash = createHash("sha256").update(stableSerializeFixture(fixture)).digest("hex");
    return `twin-fixture:${twin.id}:${twin.version}:${hash}`;
  });
}

export type MockProcessHandler = (spec: ProcessSpec) => Promise<ProcessOutcome>;

export function createMockProcessRunner(handler: MockProcessHandler): ProcessRunner {
  return {
    run: handler,
    isAvailable: async () => true,
  } as unknown as ProcessRunner;
}
