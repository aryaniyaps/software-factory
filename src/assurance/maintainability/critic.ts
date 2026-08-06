import {
  type CriticFinding,
  type CriticReport,
  findingKey,
  isBlockingFinding,
  parseCriticReport,
} from "./findings.js";

export interface CriticEvidenceBundle {
  readonly workOrderId: string;
  readonly acceptanceIds: readonly string[];
  readonly blueprintRefs: readonly string[];
  readonly fitnessFindingRefs: readonly string[];
  readonly diffRefs: readonly string[];
  readonly graphRefs: readonly string[];
  readonly behavioralEvidenceRefs: readonly string[];
}

const IMPLEMENTER_NARRATIVE_FIELDS = [
  "implementerSummary",
  "implementerReasoning",
  "implementerNarrative",
  "implementerRationale",
  "persuasiveNarrative",
] as const;

export type CriticAssessmentOutcome = "pass" | "block" | "expand_evidence" | "insufficient_evidence";

export interface CriticDisagreement {
  readonly key: string;
  readonly blockingCritics: readonly string[];
  readonly nonBlockingCritics: readonly string[];
}

export interface CriticAssessmentResult {
  readonly outcome: CriticAssessmentOutcome;
  readonly blockingFindings: readonly CriticFinding[];
  readonly disagreements: readonly CriticDisagreement[];
  readonly reports: readonly CriticReport[];
}

export interface AssessCriticReportsInput {
  readonly requiredCritics: number;
  readonly evidence: CriticEvidenceBundle;
  readonly reports: readonly unknown[];
}

export function stripImplementerNarrative<T extends Record<string, unknown>>(input: T): CriticEvidenceBundle {
  const sanitized = { ...input };
  for (const field of IMPLEMENTER_NARRATIVE_FIELDS) {
    delete sanitized[field];
  }
  return sanitized as unknown as CriticEvidenceBundle;
}

function indexBlockingByKey(report: CriticReport): Map<string, CriticFinding> {
  const blocking = new Map<string, CriticFinding>();
  for (const finding of report.findings) {
    if (isBlockingFinding(finding)) blocking.set(findingKey(finding), finding);
  }
  return blocking;
}

function detectDisagreements(reports: readonly CriticReport[]): CriticDisagreement[] {
  const keys = new Set<string>();
  for (const report of reports) {
    for (const finding of report.findings) keys.add(findingKey(finding));
  }

  const disagreements: CriticDisagreement[] = [];
  for (const key of keys) {
    const blockingCritics: string[] = [];
    const nonBlockingCritics: string[] = [];
    for (const report of reports) {
      const blocking = indexBlockingByKey(report);
      if (blocking.has(key)) blockingCritics.push(report.criticId);
      else nonBlockingCritics.push(report.criticId);
    }
    if (blockingCritics.length > 0 && nonBlockingCritics.length > 0) {
      disagreements.push({ key, blockingCritics, nonBlockingCritics });
    }
  }
  return disagreements;
}

export function assessCriticReports(input: AssessCriticReportsInput): CriticAssessmentResult {
  stripImplementerNarrative(input.evidence as unknown as Record<string, unknown>);

  const reports = input.reports.map((report) => parseCriticReport(report));
  if (reports.length < input.requiredCritics) {
    return {
      outcome: "insufficient_evidence",
      blockingFindings: [],
      disagreements: [],
      reports,
    };
  }

  const blockingFindings = reports.flatMap((report) => report.findings.filter(isBlockingFinding));
  const disagreements = input.requiredCritics >= 2 ? detectDisagreements(reports) : [];

  if (disagreements.length > 0) {
    return { outcome: "expand_evidence", blockingFindings, disagreements, reports };
  }

  if (blockingFindings.length > 0) {
    return { outcome: "block", blockingFindings, disagreements, reports };
  }

  return { outcome: "pass", blockingFindings, disagreements, reports };
}
