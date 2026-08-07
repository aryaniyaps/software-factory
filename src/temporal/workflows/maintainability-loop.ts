import type { AgentOutput } from "../../contracts/nodes.js";
import type { ChecksResult } from "../activities/types.js";
import {
  consumeRepairAttempt,
  isBudgetExhausted,
  recordWallClock,
  type WorkflowBudget,
} from "../../policy/retry-policy.js";
import type {
  MaintainabilityAssessmentResult,
  MaintainabilityPolicy,
  MaintainabilityRepairScope,
} from "../../assurance/maintainability/policy.js";
import type { NodeAttemptRef } from "./types.js";
import { runNodeAttempt } from "./run-node.js";
import { uuid4 } from "@temporalio/workflow";

export interface MaintainabilityLoopResult {
  assessAttempts: NodeAttemptRef[];
  refactorAttempts: NodeAttemptRef[];
  behaviorAttempts: NodeAttemptRef[];
  budget: WorkflowBudget;
  passed: boolean;
  failed: boolean;
  report?: MaintainabilityAssessmentResult["report"];
}

function failResult(
  partial: Pick<MaintainabilityLoopResult, "assessAttempts" | "refactorAttempts" | "behaviorAttempts" | "budget" | "report">,
): MaintainabilityLoopResult {
  return { ...partial, passed: false, failed: true };
}

export async function runMaintainabilityLoop(options: {
  runId: string;
  budget: WorkflowBudget;
  policy: MaintainabilityPolicy;
  assess: (evidenceCollectionRounds: number, attemptId: string) => Promise<MaintainabilityAssessmentResult>;
  runBehaviorChecks: () => Promise<ChecksResult>;
  runRefactor: (scope: MaintainabilityRepairScope, attempt: number, attemptId: string) => Promise<AgentOutput>;
}): Promise<MaintainabilityLoopResult> {
  let budget = options.budget;
  const assessAttempts: NodeAttemptRef[] = [];
  const refactorAttempts: NodeAttemptRef[] = [];
  const behaviorAttempts: NodeAttemptRef[] = [];
  let evidenceCollectionRounds = 0;
  let assessAttemptNumber = 1;

  const base = () => ({ assessAttempts, refactorAttempts, behaviorAttempts, budget });

  const recordAssessment = async () => {
    const started = Date.now();
    const attemptId = `maintainability_assess-${assessAttemptNumber}-${uuid4()}`;
    const assessment = await runNodeAttempt({
      runId: options.runId,
      node: "maintainability_assess",
      attemptNumber: assessAttemptNumber,
      budget,
      execute: () => options.assess(evidenceCollectionRounds, attemptId),
      attemptId,
    });
    budget = recordWallClock(assessment.budget, Date.now() - started);
    assessAttempts.push(assessment.attemptRef);
    assessAttemptNumber += 1;
    return assessment;
  };

  const handleAssessment = async (result: MaintainabilityAssessmentResult): Promise<MaintainabilityLoopResult | "continue_collect" | "continue_refactor"> => {
    if (result.outcome === "pass") {
      return { ...base(), passed: true, failed: false, report: result.report };
    }
    if (result.outcome === "policy_block") {
      return failResult({ ...base(), report: result.report });
    }
    if (result.outcome === "insufficient_evidence") {
      evidenceCollectionRounds += 1;
      if (evidenceCollectionRounds > options.policy.maxEvidenceCollectionRounds) {
        return failResult({ ...base(), report: result.report });
      }
      return "continue_collect";
    }
    if (result.outcome === "repairable" && result.repairScope) {
      return "continue_refactor";
    }
    return failResult({ ...base(), report: result.report });
  };

  let assessment = await recordAssessment();
  if (assessment.result.status !== "succeeded" || !assessment.result.output) {
    return failResult(base());
  }

  let current = assessment.result.output as MaintainabilityAssessmentResult;
  for (;;) {
    const handled = await handleAssessment(current);
    if (handled !== "continue_collect" && handled !== "continue_refactor") {
      return handled;
    }

    if (handled === "continue_collect") {
      assessment = await recordAssessment();
      if (assessment.result.status !== "succeeded" || !assessment.result.output) {
        return failResult(base());
      }
      current = assessment.result.output as MaintainabilityAssessmentResult;
      continue;
    }

    let refactorAttempt = 1;
    while (refactorAttempt <= options.policy.maxRefactorAttempts) {
      if (isBudgetExhausted(budget)) {
        return failResult({ ...base(), report: current.report });
      }

      const scope = current.repairScope!;
      budget = consumeRepairAttempt(budget, 0);

      const refactorStarted = Date.now();
      const attemptId = `repair-${refactorAttempt}-${uuid4()}`;
      const refactor = await runNodeAttempt({
        runId: options.runId,
        node: "repair",
        attemptNumber: refactorAttempt,
        budget,
        execute: () => options.runRefactor(scope, refactorAttempt, attemptId),
        attemptId,
      });
      budget = recordWallClock(refactor.budget, Date.now() - refactorStarted);
      refactorAttempts.push(refactor.attemptRef);

      if (refactor.result.status === "failed") {
        return failResult({ ...base(), report: current.report });
      }

      const behaviorStarted = Date.now();
      const behavior = await runNodeAttempt({
        runId: options.runId,
        node: "deterministic_checks",
        attemptNumber: refactorAttempt,
        budget,
        execute: options.runBehaviorChecks,
      });
      budget = recordWallClock(behavior.budget, Date.now() - behaviorStarted);
      behaviorAttempts.push(behavior.attemptRef);

      if (behavior.result.status !== "succeeded" || !behavior.result.output?.passed) {
        return failResult({ ...base(), report: current.report });
      }

      assessment = await recordAssessment();
      if (assessment.result.status !== "succeeded" || !assessment.result.output) {
        return failResult(base());
      }
      current = assessment.result.output as MaintainabilityAssessmentResult;

      const reassessed = await handleAssessment(current);
      if (reassessed === "continue_collect") {
        assessment = await recordAssessment();
        if (assessment.result.status !== "succeeded" || !assessment.result.output) {
          return failResult(base());
        }
        current = assessment.result.output as MaintainabilityAssessmentResult;
        break;
      }
      if (reassessed !== "continue_refactor") {
        return reassessed;
      }

      refactorAttempt += 1;
    }

    if (current.outcome === "repairable") {
      return failResult({ ...base(), report: current.report });
    }
  }
}
