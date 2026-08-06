import {
  createFinding,
  supportsTypeScript,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, isChangedPath, runAdapterCommand } from "./base.js";

interface StrykerReport {
  schemaVersion?: string;
  files?: Record<string, {
    mutants?: Array<{ id?: string; status?: string; location?: { start: { line: number }; end: { line: number } } }>;
  }>;
  metrics?: { mutationScore?: number };
}

function parseStryker(parsed: unknown): StrykerReport {
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as StrykerReport;
}

export function createStrykerAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "stryker",
    version: "1.0.0",
    capability: "mutation_testing",
    async supports(context: RepositoryContext): Promise<boolean> {
      if (!supportsTypeScript(context)) return false;
      return options.runner.isAvailable(options.command.command, ["--version"]);
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const baselineReport = input.baselineRoot
        ? parseStryker((await runAdapterCommand(options, input.baselineRoot)).parsed)
        : {};
      const candidateReport = parseStryker(
        (await runAdapterCommand(options, input.candidateRoot)).parsed,
      );
      const baselineScore = baselineReport.metrics?.mutationScore;
      const candidateScore = candidateReport.metrics?.mutationScore;
      if (baselineScore !== undefined && candidateScore !== undefined && candidateScore < baselineScore) {
        findings.push(createFinding({
          adapterId: "stryker",
          ruleId: "stryker-mutation",
          dimension: "testability",
          severity: "warn",
          confidence: 0.8,
          baseline: baselineScore,
          candidate: candidateScore,
          delta: candidateScore - baselineScore,
          locations: [],
          evidenceRefs: evidenceRef(input.evidenceManifestId, "stryker:mutation-score"),
          explanation: `Mutation score decreased from ${baselineScore} to ${candidateScore}`,
          shadowOnly: true,
        }));
      }

      const changed = new Set(input.changedFiles ?? []);
      for (const [file, fileReport] of Object.entries(candidateReport.files ?? {})) {
        if (!isChangedPath(file, changed)) continue;
        for (const mutant of fileReport.mutants ?? []) {
          if (mutant.status !== "Survived") continue;
          findings.push(createFinding({
            adapterId: "stryker",
            ruleId: "stryker-mutation",
            dimension: "testability",
            severity: "warn",
            confidence: 0.75,
            locations: [{ file, line: mutant.location?.start.line }],
            evidenceRefs: evidenceRef(input.evidenceManifestId, `stryker:${mutant.id ?? file}`),
            explanation: `Surviving mutant detected in ${file}`,
            shadowOnly: true,
          }));
        }
      }
      return findings;
    },
  };
}
