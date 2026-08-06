import type { Decision } from "../../contracts/gates.js";
import type {
  ProbeAgentConfig,
  ProbeBank,
  ProbeRunRecord,
  ProbeSuiteResult,
} from "../../probes/types.js";

export interface ProbeWorkflowInput {
  readonly runId: string;
  readonly attemptId: string;
  readonly bank: ProbeBank;
  readonly probeIds: readonly string[];
  readonly baselineRoot: string;
  readonly candidateRoot: string;
  readonly agentConfig: ProbeAgentConfig;
  readonly candidateDiffSummary: string;
}

export interface ProbeWorkflowResult {
  readonly decision: Decision;
  readonly suite: ProbeSuiteResult;
  readonly records: readonly ProbeRunRecord[];
  readonly destroyedWorktrees: readonly string[];
}

export async function runProbeWorkflow(
  input: ProbeWorkflowInput,
  runProbe: (probeId: string) => Promise<{
    record: ProbeRunRecord;
    destroyedWorktrees: readonly string[];
  }>,
  buildSuite: (
    records: readonly ProbeRunRecord[],
    evidenceRefs: readonly string[],
    bankVersion: string,
  ) => ProbeSuiteResult,
): Promise<ProbeWorkflowResult> {
  const records: ProbeRunRecord[] = [];
  const destroyedWorktrees: string[] = [];
  const evidenceRefs: string[] = [];

  for (const probeId of input.probeIds) {
    const result = await runProbe(probeId);
    records.push(result.record);
    destroyedWorktrees.push(...result.destroyedWorktrees);
    evidenceRefs.push(`probe-run:${probeId}:${input.attemptId}`);
  }

  const suite = buildSuite(records, evidenceRefs, input.bank.bankVersion);

  return {
    decision: suite.decision,
    suite,
    records,
    destroyedWorktrees,
  };
}
