import {
  createFinding,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, isChangedPath, runAdapterCommand } from "./base.js";

interface GitChurnEntry {
  file: string;
  commits: number;
  churn: number;
}

function parseGitChurn(stdout: string): GitChurnEntry[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [file, commits, churn] = line.split("\t");
      return {
        file: file ?? "",
        commits: Number(commits ?? 0),
        churn: Number(churn ?? 0),
      };
    })
    .filter((entry) => entry.file.length > 0);
}

export function createGitHistoryAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "git-history",
    version: "1.0.0",
    capability: "change_history",
    async supports(context: RepositoryContext): Promise<boolean> {
      return options.runner.isAvailable(options.command.command, ["--version"]);
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const baselineEntries = input.baselineRoot
        ? parseGitChurn((await runAdapterCommand(options, input.baselineRoot)).outcome.stdout)
        : [];
      const candidateEntries = parseGitChurn(
        (await runAdapterCommand(options, input.candidateRoot)).outcome.stdout,
      );
      const baselineByFile = new Map(baselineEntries.map((entry) => [entry.file, entry]));
      const changed = new Set(input.changedFiles ?? []);

      for (const entry of candidateEntries) {
        if (!isChangedPath(entry.file, changed)) continue;
        const baseline = baselineByFile.get(entry.file);
        const churnDelta = entry.churn - (baseline?.churn ?? 0);
        if (churnDelta <= 0) continue;
        findings.push(createFinding({
          adapterId: "git-history",
          ruleId: "git-hotspot",
          dimension: "modifiability",
          severity: "warn",
          confidence: 0.6,
          baseline: baseline?.churn,
          candidate: entry.churn,
          delta: churnDelta,
          locations: [{ file: entry.file }],
          evidenceRefs: evidenceRef(input.evidenceManifestId, `git:${entry.file}`),
          explanation: `Hotspot churn increased by ${churnDelta} in ${entry.file}`,
          shadowOnly: true,
        }));
      }
      return findings;
    },
  };
}
