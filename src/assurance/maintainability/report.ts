import type { FitnessFinding, FitnessRawSubScore, FitnessRunResult } from "../fitness/types.js";
import { MAINTAINABILITY_DIMENSIONS, type MaintainabilityDimension } from "../fitness/types.js";
import type { CriticAssessmentResult } from "./critic.js";
import type { CriticFinding, CriticReport } from "./findings.js";
import type { CriticFinding as ParsedCriticFinding } from "./findings.js";

export const MAINTAINABILITY_REPORT_SCHEMA = "maintainability-report.v1" as const;

export interface DimensionVectorEntry {
  readonly dimension: MaintainabilityDimension;
  readonly findingCount: number;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly evidenceRefs: readonly string[];
}

export interface MaintainabilityReport {
  readonly schemaVersion: typeof MAINTAINABILITY_REPORT_SCHEMA;
  readonly policyVersion: string;
  readonly vector: readonly DimensionVectorEntry[];
  readonly fitnessFindings: readonly FitnessFinding[];
  readonly criticFindings: readonly ParsedCriticFinding[];
  readonly rawSubScores: readonly FitnessRawSubScore[];
  readonly criticReports: readonly CriticReport[];
  readonly fitnessOutcome: FitnessRunResult["outcome"];
  readonly criticOutcome: CriticAssessmentResult["outcome"];
  readonly evidenceRefs: readonly string[];
}

function emptyVector(): DimensionVectorEntry[] {
  return MAINTAINABILITY_DIMENSIONS.map((dimension) => ({
    dimension,
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    evidenceRefs: [],
  }));
}

function symbolPath(symbol: string): string | undefined {
  const file = symbol.split("::")[0]?.split(":")[0];
  return file && file.includes("/") ? file : undefined;
}

export function buildMaintainabilityReport(
  fitness: FitnessRunResult,
  critic: CriticAssessmentResult,
  policyVersion = "inline",
): MaintainabilityReport {
  const vector = emptyVector();
  const vectorByDimension = new Map(vector.map((entry) => [entry.dimension, entry]));

  const addFinding = (
    dimension: MaintainabilityDimension,
    severity: "block" | "warn" | "info",
    evidenceRefs: readonly string[],
  ) => {
    const entry = vectorByDimension.get(dimension)!;
    const refs = new Set(entry.evidenceRefs);
    for (const ref of evidenceRefs) refs.add(ref);
    vectorByDimension.set(dimension, {
      dimension,
      findingCount: entry.findingCount + 1,
      blockingCount: entry.blockingCount + (severity === "block" ? 1 : 0),
      warningCount: entry.warningCount + (severity === "warn" ? 1 : 0),
      evidenceRefs: [...refs],
    });
  };

  for (const finding of fitness.findings) {
    addFinding(finding.dimension, finding.severity, finding.evidenceRefs);
  }

  const criticFindings = critic.reports.flatMap((report) => report.findings);
  for (const finding of criticFindings) {
    addFinding(finding.dimension, finding.severity, finding.evidenceRefs);
  }

  const evidenceRefs = new Set<string>();
  for (const finding of fitness.findings) {
    for (const ref of finding.evidenceRefs) evidenceRefs.add(ref);
  }
  for (const finding of criticFindings) {
    for (const ref of finding.evidenceRefs) evidenceRefs.add(ref);
  }

  return {
    schemaVersion: MAINTAINABILITY_REPORT_SCHEMA,
    policyVersion,
    vector: MAINTAINABILITY_DIMENSIONS.map((dimension) => vectorByDimension.get(dimension)!),
    fitnessFindings: [...fitness.findings],
    criticFindings,
    rawSubScores: [...fitness.rawSubScores],
    criticReports: [...critic.reports],
    fitnessOutcome: fitness.outcome,
    criticOutcome: critic.outcome,
    evidenceRefs: [...evidenceRefs],
  };
}

export function repairPathsFromFindings(
  fitnessFindings: readonly FitnessFinding[],
  criticFindings: readonly CriticFinding[],
): string[] {
  const paths = new Set<string>();
  for (const finding of fitnessFindings) {
    for (const location of finding.locations) {
      if (location.file) paths.add(location.file);
    }
  }
  for (const finding of criticFindings) {
    for (const symbol of finding.affectedSymbols) {
      const path = symbolPath(symbol);
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

export function repairSymbolsFromFindings(
  fitnessFindings: readonly FitnessFinding[],
  criticFindings: readonly CriticFinding[],
): string[] {
  const symbols = new Set<string>();
  for (const finding of fitnessFindings) {
    for (const location of finding.locations) {
      if (location.symbol) symbols.add(location.symbol);
      if (location.file) symbols.add(location.file);
    }
  }
  for (const finding of criticFindings) {
    for (const symbol of finding.affectedSymbols) symbols.add(symbol);
  }
  return [...symbols];
}
