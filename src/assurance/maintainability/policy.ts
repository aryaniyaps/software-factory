import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import type { FitnessRunResult } from "../fitness/types.js";
import type { CriticAssessmentResult } from "./critic.js";
import {
  buildMaintainabilityReport,
  repairPathsFromFindings,
  repairSymbolsFromFindings,
  type MaintainabilityReport,
} from "./report.js";
import { type CriticFinding } from "./findings.js";

export const MAINTAINABILITY_POLICY_SCHEMA = "maintainability-policy.v1" as const;

export type MaintainabilityAssessmentOutcome =
  | "pass"
  | "repairable"
  | "insufficient_evidence"
  | "policy_block";

export const MaintainabilityPolicySchema = Type.Object({
  schemaVersion: Type.Literal(MAINTAINABILITY_POLICY_SCHEMA),
  policyVersion: Type.String({ minLength: 1 }),
  maxRefactorAttempts: Type.Integer({ minimum: 0 }),
  maxEvidenceCollectionRounds: Type.Integer({ minimum: 0 }),
  baselineRegression: Type.Object({
    minRelativeDelta: Type.Number({ minimum: 0 }),
    minConfidence: Type.Number({ minimum: 0, maximum: 1 }),
  }, { additionalProperties: false }),
  contradictionResolution: Type.Object({
    maxRounds: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export type MaintainabilityPolicy = Readonly<Static<typeof MaintainabilityPolicySchema>>;

export interface MaintainabilityRepairScope {
  readonly mode: "maintainability_refactor";
  readonly findingIds: readonly string[];
  readonly affectedSymbols: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly minimumRepairs: readonly string[];
  readonly forbiddenActions: readonly string[];
}

export interface MaintainabilityReason {
  readonly code: string;
  readonly message: string;
}

export interface MaintainabilityAssessmentResult {
  readonly outcome: MaintainabilityAssessmentOutcome;
  readonly report: MaintainabilityReport;
  readonly repairScope?: MaintainabilityRepairScope;
  readonly collectEvidenceRequests?: readonly string[];
  readonly reasons: readonly MaintainabilityReason[];
}

function parsePolicy<T>(schema: TSchema, value: unknown, label: string): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid ${label}: ${error?.message || "schema mismatch"}`);
}

export function parseMaintainabilityPolicy(value: unknown): MaintainabilityPolicy {
  return parsePolicy(MaintainabilityPolicySchema, value, "maintainability policy");
}

export const DEFAULT_MAINTAINABILITY_POLICY: MaintainabilityPolicy = {
  schemaVersion: MAINTAINABILITY_POLICY_SCHEMA,
  policyVersion: "default-inline",
  maxRefactorAttempts: 2,
  maxEvidenceCollectionRounds: 1,
  baselineRegression: { minRelativeDelta: 0.15, minConfidence: 0.7 },
  contradictionResolution: { maxRounds: 1 },
};

const REFACTOR_FORBIDDEN_ACTIONS = [
  "downgrade findings",
  "change gate policy",
  "modify acceptance criteria",
  "modify hidden scenarios",
  "modify hidden evaluators",
] as const;

function hasMaterialBaselineRegression(
  fitness: FitnessRunResult,
  policy: MaintainabilityPolicy,
): boolean {
  return fitness.findings.some((finding) => {
    if (finding.baseline === undefined || finding.candidate === undefined) return false;
    if (finding.confidence < policy.baselineRegression.minConfidence) return false;
    const baseline = Math.abs(finding.baseline);
    const delta = finding.candidate - finding.baseline;
    if (delta <= 0) return false;
    const relative = baseline === 0 ? delta : delta / baseline;
    return relative >= policy.baselineRegression.minRelativeDelta;
  });
}

function blockingFitnessFindings(fitness: FitnessRunResult): FitnessRunResult["findings"] {
  return fitness.findings.filter((finding) => finding.severity === "block" && !finding.shadowOnly);
}

function blockingCriticFindings(critic: CriticAssessmentResult): readonly CriticFinding[] {
  return critic.blockingFindings;
}

function buildRepairScope(
  fitness: FitnessRunResult,
  critic: CriticAssessmentResult,
): MaintainabilityRepairScope {
  const blockingFitness = blockingFitnessFindings(fitness);
  const blockingCritic = blockingCriticFindings(critic);
  const regressionFindings = fitness.findings.filter((finding) =>
    finding.baseline !== undefined && finding.candidate !== undefined && finding.candidate > finding.baseline,
  );
  const actionableFitness = blockingFitness.length > 0 ? blockingFitness : regressionFindings;
  const findingIds = [
    ...actionableFitness.map((finding) => finding.id),
    ...blockingCritic.map((finding) => finding.id),
  ];
  const minimumRepairs = blockingCritic.map((finding) => finding.minimumRepair);
  const affectedSymbols = repairSymbolsFromFindings(actionableFitness, blockingCritic);
  const allowedPaths = repairPathsFromFindings(actionableFitness, blockingCritic);

  return {
    mode: "maintainability_refactor",
    findingIds,
    affectedSymbols,
    allowedPaths,
    minimumRepairs,
    forbiddenActions: [...REFACTOR_FORBIDDEN_ACTIONS],
  };
}

function collectEvidenceRequests(critic: CriticAssessmentResult): string[] {
  const requests: string[] = [];
  for (const disagreement of critic.disagreements) {
    requests.push(`resolve critic disagreement for ${disagreement.key}`);
  }
  if (critic.outcome === "insufficient_evidence") {
    requests.push("collect additional critic reports");
  }
  return requests;
}

export function assessMaintainability(input: {
  policy: MaintainabilityPolicy;
  fitness: FitnessRunResult;
  critic: CriticAssessmentResult;
  evidenceCollectionRounds: number;
}): MaintainabilityAssessmentResult {
  const report = buildMaintainabilityReport(
    input.fitness,
    input.critic,
    input.policy.policyVersion,
  );

  if (input.fitness.outcome === "policy_block") {
    return {
      outcome: "policy_block",
      report,
      reasons: [{ code: "FITNESS_POLICY_BLOCK", message: "fitness policy hard block" }],
    };
  }

  if (input.critic.outcome === "expand_evidence") {
    if (input.evidenceCollectionRounds >= input.policy.contradictionResolution.maxRounds) {
      return {
        outcome: "policy_block",
        report,
        reasons: [{ code: "CONTRADICTION_UNRESOLVED", message: "independent critics disagree" }],
      };
    }
    return {
      outcome: "insufficient_evidence",
      report,
      collectEvidenceRequests: collectEvidenceRequests(input.critic),
      reasons: [{ code: "CRITIC_DISAGREEMENT", message: "expand evidence before deciding" }],
    };
  }

  const missingEvidence =
    input.fitness.outcome === "insufficient_evidence"
    || input.critic.outcome === "insufficient_evidence";

  if (missingEvidence) {
    if (input.evidenceCollectionRounds >= input.policy.maxEvidenceCollectionRounds) {
      return {
        outcome: "policy_block",
        report,
        reasons: [{ code: "EVIDENCE_EXHAUSTED", message: "required maintainability evidence missing" }],
      };
    }
    return {
      outcome: "insufficient_evidence",
      report,
      collectEvidenceRequests: collectEvidenceRequests(input.critic),
      reasons: [{ code: "INSUFFICIENT_EVIDENCE", message: "collect maintainability evidence" }],
    };
  }

  const criticBlocks = blockingCriticFindings(input.critic);
  const fitnessBlocks = blockingFitnessFindings(input.fitness);
  const baselineRegression = hasMaterialBaselineRegression(input.fitness, input.policy);

  if (criticBlocks.length > 0 || fitnessBlocks.length > 0 || baselineRegression) {
    return {
      outcome: "repairable",
      report,
      repairScope: buildRepairScope(input.fitness, input.critic),
      reasons: [{
        code: criticBlocks.length > 0 ? "CRITIC_BLOCK" : baselineRegression ? "BASELINE_REGRESSION" : "FITNESS_BLOCK",
        message: "maintainability findings require bounded refactor",
      }],
    };
  }

  if (input.fitness.outcome === "pass" && input.critic.outcome === "pass") {
    return { outcome: "pass", report, reasons: [] };
  }

  return { outcome: "pass", report, reasons: [] };
}
