import type { Decision } from "../contracts/gates.js";
import { sampleProbes } from "./bank.js";
import { buildProbeSuiteResult } from "./comparator.js";
import { ProbeRunner, type ProbeRunnerDependencies } from "./runner.js";
import type { ProbeAgentConfig, ProbeBank, ProbeRunRecord, ProbeSuiteResult } from "./types.js";

export interface ProbeWorkflowInput {
  readonly runId: string;
  readonly attemptId: string;
  readonly bank: ProbeBank;
  readonly probeCount: number;
  readonly baselineRoot: string;
  readonly candidateRoot: string;
  readonly agentConfig: ProbeAgentConfig;
  readonly candidateDiffSummary: string;
  readonly seed?: number;
}

export interface ProbeWorkflowResult {
  readonly decision: Decision;
  readonly suite: ProbeSuiteResult;
  readonly records: readonly ProbeRunRecord[];
  readonly destroyedWorktrees: readonly string[];
}

export async function runProbeSuite(
  input: ProbeWorkflowInput,
  deps: ProbeRunnerDependencies,
): Promise<ProbeWorkflowResult> {
  const runner = new ProbeRunner(deps);
  const probes = sampleProbes(input.bank, input.probeCount, input.seed ?? 0);
  const records: ProbeRunRecord[] = [];
  const destroyedWorktrees: string[] = [];
  const evidenceRefs: string[] = [];

  for (const probe of probes) {
    const result = await runner.runProbe({
      runId: input.runId,
      attemptId: `${input.attemptId}:${probe.id}`,
      probe,
      baselineRoot: input.baselineRoot,
      candidateRoot: input.candidateRoot,
      agentConfig: input.agentConfig,
      candidateDiffSummary: input.candidateDiffSummary,
    });
    records.push(result.record);
    destroyedWorktrees.push(...result.destroyedWorktrees);
    evidenceRefs.push(`probe-run:${probe.id}:${input.attemptId}`);
  }

  const suite = buildProbeSuiteResult(records, evidenceRefs, {
    bankVersion: input.bank.bankVersion,
  });

  return {
    decision: suite.decision,
    suite,
    records,
    destroyedWorktrees,
  };
}
