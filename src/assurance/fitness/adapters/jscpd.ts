import {
  createFinding,
  supportsTypeScript,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, isChangedPath, runAdapterCommand } from "./base.js";

interface JscpdClone {
  firstFile?: { name?: string; start?: number; end?: number };
  secondFile?: { name?: string; start?: number; end?: number };
  lines?: number;
}

function parseClones(parsed: unknown): JscpdClone[] {
  if (!parsed || typeof parsed !== "object") return [];
  const duplicates = (parsed as { duplicates?: JscpdClone[] }).duplicates;
  return Array.isArray(duplicates) ? duplicates : [];
}

export function createJscpdAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "jscpd",
    version: "1.0.0",
    capability: "clone_detection",
    async supports(context: RepositoryContext): Promise<boolean> {
      if (!supportsTypeScript(context)) return false;
      return options.runner.isAvailable(options.command.command, ["--version"]);
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const baselineClones = input.baselineRoot
        ? parseClones((await runAdapterCommand(options, input.baselineRoot)).parsed)
        : [];
      const candidateClones = parseClones(
        (await runAdapterCommand(options, input.candidateRoot)).parsed,
      );
      const baselineKeys = new Set(
        baselineClones.map((clone) =>
          `${clone.firstFile?.name}:${clone.secondFile?.name}:${clone.lines}`),
      );
      const changed = new Set(input.changedFiles ?? []);

      for (const clone of candidateClones) {
        const key = `${clone.firstFile?.name}:${clone.secondFile?.name}:${clone.lines}`;
        if (baselineKeys.has(key)) continue;
        const files = [clone.firstFile?.name, clone.secondFile?.name].filter(Boolean) as string[];
        if (!files.some((file) => isChangedPath(file, changed))) continue;
        findings.push(createFinding({
          adapterId: "jscpd",
          ruleId: "jscpd-clone",
          dimension: "modifiability",
          severity: "warn",
          confidence: 0.7,
          locations: files.map((file) => ({ file })),
          evidenceRefs: evidenceRef(input.evidenceManifestId, `jscpd:${key}`),
          explanation: `Duplicate code detected across ${files.join(" and ")} (${clone.lines ?? 0} lines)`,
          shadowOnly: true,
        }));
      }
      return findings;
    },
  };
}
