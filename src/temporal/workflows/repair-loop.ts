import type { AgentOutput } from "../../contracts/nodes.js";
import type { ChecksResult } from "../activities/types.js";
import {
  consumeRepairAttempt,
  isBudgetExhausted,
  recordWallClock,
  type WorkflowBudget,
} from "../../policy/retry-policy.js";
import type { NodeAttemptRef } from "./types.js";
import { runNodeAttempt } from "./run-node.js";

export interface RepairLoopResult {
  checksAttempts: NodeAttemptRef[];
  repairAttempts: NodeAttemptRef[];
  budget: WorkflowBudget;
  passed: boolean;
  abstained: boolean;
  repairOutput?: AgentOutput;
}

export async function runRepairLoop(options: {
  runId: string;
  budget: WorkflowBudget;
  maxRepairAttempts: number;
  runChecks: () => Promise<ChecksResult>;
  runRepair: (repairAttempt: number) => Promise<AgentOutput>;
}): Promise<RepairLoopResult> {
  let budget = options.budget;
  const checksAttempts: NodeAttemptRef[] = [];
  const repairAttempts: NodeAttemptRef[] = [];

  const initialStarted = Date.now();
  const initial = await runNodeAttempt({
    runId: options.runId,
    node: "deterministic_checks",
    attemptNumber: 1,
    budget,
    execute: options.runChecks,
  });
  budget = recordWallClock(initial.budget, Date.now() - initialStarted);
  checksAttempts.push(initial.attemptRef);

  if (initial.result.status === "succeeded" && initial.result.output?.passed) {
    return { checksAttempts, repairAttempts, budget, passed: true, abstained: false };
  }

  let repairAttempt = 1;
  let repairOutput: AgentOutput | undefined;

  while (repairAttempt <= options.maxRepairAttempts) {
    if (isBudgetExhausted(budget)) {
      return { checksAttempts, repairAttempts, budget, passed: false, abstained: true, repairOutput };
    }

    budget = consumeRepairAttempt(budget, 0);
    const repairStarted = Date.now();
    const repair = await runNodeAttempt({
      runId: options.runId,
      node: "repair",
      attemptNumber: repairAttempt,
      budget,
      execute: () => options.runRepair(repairAttempt),
      evidenceRefs: undefined,
    });
    budget = recordWallClock(repair.budget, Date.now() - repairStarted);
    repairAttempts.push(repair.attemptRef);

    if (repair.result.status === "failed") {
      return { checksAttempts, repairAttempts, budget, passed: false, abstained: false, repairOutput };
    }

    repairOutput = repair.result.output as AgentOutput;

    const recheckStarted = Date.now();
    const recheck = await runNodeAttempt({
      runId: options.runId,
      node: "deterministic_checks",
      attemptNumber: repairAttempt + 1,
      budget,
      execute: options.runChecks,
    });
    budget = recordWallClock(recheck.budget, Date.now() - recheckStarted);
    checksAttempts.push(recheck.attemptRef);

    if (recheck.result.status === "succeeded" && recheck.result.output?.passed) {
      return { checksAttempts, repairAttempts, budget, passed: true, abstained: false, repairOutput };
    }

    repairAttempt += 1;
  }

  if (isBudgetExhausted(budget)) {
    return { checksAttempts, repairAttempts, budget, passed: false, abstained: true, repairOutput };
  }

  return { checksAttempts, repairAttempts, budget, passed: false, abstained: false, repairOutput };
}
