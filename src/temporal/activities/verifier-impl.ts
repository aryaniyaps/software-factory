import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { ProcessRunner } from "../../assurance/fitness/process-runner.js";
import type { EvidenceStore } from "../../evidence/evidence-store.js";
import { filterScenariosForAcceptance, loadScenariosFromRoot } from "../../scenarios/loader.js";
import { ScenarioRunner, trajectoryBodyHash } from "../../scenarios/runner.js";
import { SCENARIO_POLICY_VERSION } from "../../scenarios/satisfaction.js";
import type { BehavioralVerifyInput, BehavioralVerifyResult, VerifierActivities } from "./verifier.js";

const execFile = promisify(nodeExecFile);

export interface VerifierActivityDependencies {
  readonly hiddenScenariosRoot: string;
  readonly evidenceStore?: EvidenceStore;
  readonly projection?: {
    recordScenarioRun(input: {
      runId: string;
      scenarioId: string;
      attemptId: string;
      status: string;
      satisfaction?: number;
      trajectoryUri?: string;
      trajectorySha256?: string;
      startedAt: string;
      completedAt?: string;
    }): Promise<void>;
  };
  readonly prepareBaseline?: (input: BehavioralVerifyInput) => Promise<string>;
  readonly runner?: ScenarioRunner;
}

export function createVerifierActivities(deps: VerifierActivityDependencies): VerifierActivities {
  const runner = deps.runner ?? new ScenarioRunner({ runner: new ProcessRunner() });

  return {
    async runBehavioralVerification(input): Promise<BehavioralVerifyResult> {
      const attemptId = input.run.attemptId ?? "behavioral-verify-1";
      const scenarios = filterScenariosForAcceptance(
        await loadScenariosFromRoot(deps.hiddenScenariosRoot, { hiddenRoot: deps.hiddenScenariosRoot, role: "behavior_verifier" }),
        input.acceptanceIds ?? [],
      );

      const baselineRoot = deps.prepareBaseline
        ? await deps.prepareBaseline(input)
        : await checkoutRevision(input.worktree.path, input.baselineRevision);

      const suiteInput = {
        runId: input.run.runId,
        attemptId,
        baselineRoot,
        candidateRoot: input.worktree.path,
        scenarios,
        policyVersion: SCENARIO_POLICY_VERSION,
      };

      const { suite, records } = await runner.runSuite(suiteInput);
      const evidenceRefs: string[] = [...suite.evidenceRefs];

      if (deps.evidenceStore) {
        for (const record of records) {
          for (const trajectory of record.trajectories) {
            const stored = await deps.evidenceStore.appendEvidence({
              runId: input.run.runId,
              item: {
                id: `ev-scn-${trajectory.scenarioId}-${trajectory.attemptId}-${trajectory.revision}-${trajectory.repeatIndex}`,
                kind: "scenario",
                schemaVersion: "scenario-trajectory.v1",
                mediaType: "application/json",
                sha256: trajectoryBodyHash(trajectory),
                producer: { type: "behavior_verifier", id: "scenario-runner", version: "1" },
                subject: {
                  scenarioId: trajectory.scenarioId,
                  attemptId: trajectory.attemptId,
                  revision: trajectory.revision,
                  repeatIndex: String(trajectory.repeatIndex),
                },
                createdAt: new Date().toISOString(),
                redaction: "none",
              },
              body: JSON.stringify(trajectory),
            });
            evidenceRefs.push(stored.id);
          }
        }

        await deps.evidenceStore.recordGateDecision({
          runId: input.run.runId,
          gateId: "behavioral_verify",
          decision: suite.decision,
          policyVersion: suite.policyVersion,
          reasons: suite.runs.map((run: { scenarioId: string; satisfaction: number; variance: number; status: string }) => ({
            code: run.status,
            message: `${run.scenarioId} satisfaction=${run.satisfaction} variance=${run.variance}`,
          })),
          evidenceRefs,
        });
      }

      if (deps.projection) {
        for (const record of records) {
          const primaryTrajectory = record.trajectories.find((trajectory) => trajectory.revision === "candidate") ?? record.trajectories[0];
          await deps.projection.recordScenarioRun({
            runId: input.run.runId,
            scenarioId: record.scenarioId,
            attemptId: record.attemptId,
            status: record.status,
            satisfaction: record.satisfaction,
            trajectoryUri: primaryTrajectory ? `scenario-run:${record.scenarioId}:${record.attemptId}` : undefined,
            trajectorySha256: primaryTrajectory ? trajectoryBodyHash(primaryTrajectory) : undefined,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          });
        }
      }

      return {
        passed: suite.decision === "pass",
        decision: suite.decision,
        suite,
        evidenceRefs,
      };
    },
  };
}

async function checkoutRevision(repositoryPath: string, revision: string): Promise<string> {
  const baselineRoot = await mkdtemp(join(tmpdir(), "sf-baseline-"));
  await mkdir(baselineRoot, { recursive: true });
  await execFile("git", ["worktree", "add", "--detach", baselineRoot, revision], { cwd: repositoryPath });
  return baselineRoot;
}
