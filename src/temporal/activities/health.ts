import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import {
  compareThresholdVersions,
  evaluateOracleVersion,
  promoteThresholdVersion,
  type CalibrationSample,
  type ThresholdVersion,
} from "../../assurance/calibration.js";
import { loadProbeBankFromRoot, sampleProbes } from "../../probes/bank.js";
import {
  computeCoChangePairs,
  computeHotspots,
  parseChurnEntries,
  type ChurnEntry,
  type CommitFileChanges,
} from "../../health/hotspots.js";
import {
  runRepositoryHealthLoop,
  type DebtWorkOrder,
  type MaintenanceOutcome,
  type ReleaseRecord,
  type RepositoryHealthLoopResult,
} from "../../health/repository-health.js";

const execFile = promisify(nodeExecFile);

export interface CollectRepositoryChurnInput {
  readonly runId: string;
  readonly repositoryRoot: string;
}

export interface CollectRepositoryChurnResult {
  readonly entries: readonly ChurnEntry[];
}

export interface CollectRepositoryCoChangesInput {
  readonly runId: string;
  readonly repositoryRoot: string;
}

export interface CollectRepositoryCoChangesResult {
  readonly commits: readonly CommitFileChanges[];
}

export interface SampleNightlyProbesInput {
  readonly runId: string;
  readonly probeBankRoot: string;
  readonly probeCount: number;
}

export interface SampleNightlyProbesResult {
  readonly probeIds: readonly string[];
}

export interface RunRepositoryHealthLoopInput {
  readonly runId: string;
  readonly repositoryRoot: string;
  readonly churnEntries: readonly ChurnEntry[];
  readonly commitFileChanges: readonly CommitFileChanges[];
  readonly releases: readonly ReleaseRecord[];
  readonly outcomes: Readonly<Record<string, MaintenanceOutcome>>;
  readonly probeIds: readonly string[];
  readonly workOrderSequence: number;
}

export interface CalibrateOracleThresholdsInput {
  readonly runId: string;
  readonly samples: readonly CalibrationSample[];
  readonly current: ThresholdVersion;
  readonly candidate?: ThresholdVersion;
  readonly evaluatorOracleId: string;
  readonly candidateOracleId: string;
}

export interface CalibrateOracleThresholdsResult {
  readonly heldOutScore: number;
  readonly promoted: boolean;
  readonly promotedVersion: string;
  readonly reason: string;
}

export interface EnqueueDebtWorkOrderInput {
  readonly runId: string;
  readonly workOrder: DebtWorkOrder;
}

export interface EnqueueDebtWorkOrderResult {
  readonly enqueued: boolean;
  readonly workOrderId: string;
}

export interface HealthActivityDependencies {
  readonly execGit?: (repositoryRoot: string, args: string[]) => Promise<string>;
  readonly loadProbeBank?: typeof loadProbeBankFromRoot;
  readonly enqueueWorkOrder?: (input: EnqueueDebtWorkOrderInput) => Promise<EnqueueDebtWorkOrderResult>;
}

async function defaultExecGit(repositoryRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", ["-C", repositoryRoot, ...args], { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function parseCoChangeCommits(stdout: string): CommitFileChanges[] {
  const commits: Array<{ commitId: string; files: string[] }> = [];
  let current: { commitId: string; files: string[] } | undefined;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("commit ")) {
      if (current) commits.push(current);
      current = { commitId: line.slice("commit ".length).trim(), files: [] };
      continue;
    }
    if (!current || line.trim().length === 0) continue;
    const file = line.trim();
    if (!file.includes("\t")) current.files.push(file);
  }
  if (current) commits.push(current);
  return commits;
}

export function createHealthActivities(deps: HealthActivityDependencies = {}) {
  const execGit = deps.execGit ?? defaultExecGit;
  const loadBank = deps.loadProbeBank ?? loadProbeBankFromRoot;
  const enqueueWorkOrder = deps.enqueueWorkOrder ?? (async (input) => ({
    enqueued: true,
    workOrderId: input.workOrder.id,
  }));

  return {
    async collectRepositoryChurn(input: CollectRepositoryChurnInput): Promise<CollectRepositoryChurnResult> {
      const stdout = await execGit(input.repositoryRoot, [
        "log",
        "--numstat",
        "--pretty=format:",
        "--since=30.days",
      ]);
      return { entries: parseChurnEntries(stdout) };
    },

    async collectRepositoryCoChanges(input: CollectRepositoryCoChangesInput): Promise<CollectRepositoryCoChangesResult> {
      const stdout = await execGit(input.repositoryRoot, [
        "log",
        "--name-only",
        "--pretty=format:commit %H",
        "--since=30.days",
      ]);
      return { commits: parseCoChangeCommits(stdout) };
    },

    async sampleNightlyProbes(input: SampleNightlyProbesInput): Promise<SampleNightlyProbesResult> {
      const bank = await loadBank(input.probeBankRoot, {
        hiddenRoot: input.probeBankRoot,
        role: "factory_orchestrator",
      });
      const probes = sampleProbes(bank, input.probeCount, Date.now());
      return { probeIds: probes.map((probe) => probe.id) };
    },

    async runRepositoryHealthLoop(input: RunRepositoryHealthLoopInput): Promise<RepositoryHealthLoopResult> {
      const outcomes = new Map(Object.entries(input.outcomes));
      return runRepositoryHealthLoop({
        runId: input.runId,
        repositoryRoot: input.repositoryRoot,
        churnEntries: input.churnEntries,
        commitFileChanges: input.commitFileChanges,
        releases: input.releases,
        outcomes,
        probeIds: input.probeIds,
        workOrderSequence: input.workOrderSequence,
      }, { computeHotspots, computeCoChangePairs });
    },

    async calibrateOracleThresholds(input: CalibrateOracleThresholdsInput): Promise<CalibrateOracleThresholdsResult> {
      const evaluation = evaluateOracleVersion(input.samples, { holdOutRatio: 0.34, seed: 11 });
      if (!input.candidate) {
        return {
          heldOutScore: evaluation.holdOutScore,
          promoted: false,
          promotedVersion: input.current.version,
          reason: "No candidate threshold version supplied",
        };
      }

      const candidate = {
        ...input.candidate,
        heldOutScore: evaluation.holdOutScore,
      };
      const comparison = compareThresholdVersions(input.current, candidate);
      const decision = promoteThresholdVersion({
        current: input.current,
        candidate,
        evaluatorOracleId: input.evaluatorOracleId,
        candidateOracleId: input.candidateOracleId,
        heldOutImprovement: candidate.heldOutScore - input.current.heldOutScore,
      });

      return {
        heldOutScore: evaluation.holdOutScore,
        promoted: decision.promoted,
        promotedVersion: decision.version,
        reason: decision.reason || comparison.evidence,
      };
    },

    async enqueueDebtWorkOrder(input: EnqueueDebtWorkOrderInput): Promise<EnqueueDebtWorkOrderResult> {
      if (input.workOrder.requiredGates.length === 0) {
        throw new Error("debt cleanup cannot bypass normal gates");
      }
      return enqueueWorkOrder(input);
    },
  };
}

export type HealthActivities = ReturnType<typeof createHealthActivities>;
