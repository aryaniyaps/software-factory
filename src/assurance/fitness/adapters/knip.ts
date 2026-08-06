import {
  createFinding,
  supportsTypeScript,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, isChangedPath, runAdapterCommand } from "./base.js";

interface KnipIssue {
  file?: string;
  name?: string;
  type?: string;
}

function parseKnipIssues(parsed: unknown): KnipIssue[] {
  if (!parsed || typeof parsed !== "object") return [];
  const issues: KnipIssue[] = [];
  for (const [type, entries] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry === "string") issues.push({ file: entry, type });
      else if (entry && typeof entry === "object") {
        issues.push({ ...(entry as KnipIssue), type });
      }
    }
  }
  return issues;
}

export function createKnipAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "knip",
    version: "1.0.0",
    capability: "dead_code",
    async supports(context: RepositoryContext): Promise<boolean> {
      if (!supportsTypeScript(context)) return false;
      return options.runner.isAvailable(options.command.command, ["--version"]);
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const baselineIssues = input.baselineRoot
        ? parseKnipIssues((await runAdapterCommand(options, input.baselineRoot)).parsed)
        : [];
      const candidateIssues = parseKnipIssues(
        (await runAdapterCommand(options, input.candidateRoot)).parsed,
      );
      const baselineKeys = new Set(
        baselineIssues.map((issue) => `${issue.type}:${issue.file}:${issue.name}`),
      );
      const changed = new Set(input.changedFiles ?? []);

      for (const issue of candidateIssues) {
        const key = `${issue.type}:${issue.file}:${issue.name}`;
        if (baselineKeys.has(key)) continue;
        const file = issue.file ?? "unknown";
        if (!isChangedPath(file, changed)) continue;
        findings.push(createFinding({
          adapterId: "knip",
          ruleId: "knip-unused",
          dimension: "reusability",
          severity: "warn",
          confidence: 0.75,
          locations: [{ file, symbol: issue.name }],
          evidenceRefs: evidenceRef(input.evidenceManifestId, `knip:${key}`),
          explanation: `Knip reported unused ${issue.type ?? "symbol"}: ${issue.name ?? file}`,
          shadowOnly: true,
        }));
      }
      return findings;
    },
  };
}
