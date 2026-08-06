import {
  createFinding,
  supportsTypeScript,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, isChangedPath, rawSubScore, runAdapterCommand } from "./base.js";

interface DepCruiserViolation {
  rule?: { name?: string; severity?: string };
  from?: string;
  to?: string;
  cycle?: string[];
}

function violationKey(violation: DepCruiserViolation): string {
  if (violation.cycle?.length) return `cycle:${violation.cycle.join("->")}`;
  return `${violation.rule?.name ?? "unknown"}:${violation.from ?? ""}->${violation.to ?? ""}`;
}

function parseViolations(parsed: unknown): DepCruiserViolation[] {
  if (Array.isArray(parsed)) return parsed as DepCruiserViolation[];
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { summary?: unknown }).summary)) {
    return (parsed as { summary: DepCruiserViolation[] }).summary;
  }
  return [];
}

function classifyRule(ruleName: string): { ruleId: string; dimension: "modularity" | "information_hiding" } {
  if (ruleName.includes("cycle") || ruleName === "no-circular") {
    return { ruleId: "dependency-cycle", dimension: "modularity" };
  }
  return { ruleId: "forbidden-dependency", dimension: "information_hiding" };
}

export function createDependencyCruiserAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "dependency-cruiser",
    version: "1.0.0",
    capability: "architecture_rules",
    async supports(context: RepositoryContext): Promise<boolean> {
      if (!supportsTypeScript(context)) return false;
      return options.runner.isAvailable(options.command.command, options.command.args.slice(0, 1));
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const rawScores = [];
      const baselineViolations = input.baselineRoot
        ? parseViolations((await runAdapterCommand(options, input.baselineRoot)).parsed)
        : [];
      const candidateResult = await runAdapterCommand(options, input.candidateRoot);
      const candidateViolations = parseViolations(candidateResult.parsed);
      rawScores.push(rawSubScore("dependency-cruiser", "violations", {
        baseline: baselineViolations,
        candidate: candidateViolations,
      }, baselineViolations.length, candidateViolations.length));

      const baselineKeys = new Set(baselineViolations.map(violationKey));
      const changed = new Set(input.changedFiles ?? []);

      for (const violation of candidateViolations) {
        const key = violationKey(violation);
        if (baselineKeys.has(key)) continue;
        const ruleName = violation.rule?.name ?? "forbidden";
        const { ruleId, dimension } = classifyRule(ruleName);
        const locations = violation.cycle?.length
          ? violation.cycle.map((file) => ({ file }))
          : [{ file: violation.from }, { file: violation.to }].filter((entry) => entry.file);
        if (!locations.some((location) => isChangedPath(location.file ?? "", changed))) continue;

        findings.push(createFinding({
          adapterId: "dependency-cruiser",
          ruleId,
          dimension,
          severity: "block",
          confidence: 1,
          locations,
          evidenceRefs: evidenceRef(input.evidenceManifestId, `dep-cruiser:${key}`),
          explanation: violation.cycle?.length
            ? `New dependency cycle detected: ${violation.cycle.join(" -> ")}`
            : `Forbidden dependency from ${violation.from} to ${violation.to}`,
        }));
      }

      return findings;
    },
  };
}
