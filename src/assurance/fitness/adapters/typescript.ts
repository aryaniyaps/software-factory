import {
  createFinding,
  supportsTypeScript,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, isChangedPath, runAdapterCommand } from "./base.js";

interface TypeScriptDiagnostic {
  file?: string;
  line?: number;
  character?: number;
  messageText?: string | { message?: string };
  category?: number;
}

function parseDiagnostics(parsed: unknown): TypeScriptDiagnostic[] {
  if (!Array.isArray(parsed)) return [];
  return parsed as TypeScriptDiagnostic[];
}

function parseTypeScriptText(stdout: string, stderr: string): TypeScriptDiagnostic[] {
  const diagnostics: TypeScriptDiagnostic[] = [];
  const pattern = /^(.+?)\((\d+),(\d+)\): error TS\d+: (.+)$/gm;
  const matches = `${stdout}\n${stderr}`.matchAll(pattern);
  for (const match of matches) {
    diagnostics.push({
      file: match[1],
      line: Number(match[2]),
      character: Number(match[3]),
      messageText: match[4],
    });
  }
  return diagnostics;
}

function diagnosticMessage(diagnostic: TypeScriptDiagnostic): string {
  if (typeof diagnostic.messageText === "string") return diagnostic.messageText;
  return diagnostic.messageText?.message ?? "TypeScript error";
}

export function createTypeScriptAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "typescript",
    version: "1.0.0",
    capability: "type_surface",
    async supports(context: RepositoryContext): Promise<boolean> {
      return supportsTypeScript(context);
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const baselineRun = input.baselineRoot
        ? await runAdapterCommand(options, input.baselineRoot)
        : undefined;
      const candidateResult = await runAdapterCommand(options, input.candidateRoot);
      const baselineDiagnostics = baselineRun
        ? parseDiagnostics(baselineRun.parsed).length > 0
          ? parseDiagnostics(baselineRun.parsed)
          : parseTypeScriptText(baselineRun.outcome.stdout, baselineRun.outcome.stderr)
        : [];
      const candidateDiagnostics = parseDiagnostics(candidateResult.parsed).length > 0
        ? parseDiagnostics(candidateResult.parsed)
        : parseTypeScriptText(candidateResult.outcome.stdout, candidateResult.outcome.stderr);
      const baselineKeys = new Set(
        baselineDiagnostics.map((entry) => `${entry.file}:${entry.line}:${diagnosticMessage(entry)}`),
      );
      const changed = new Set(input.changedFiles ?? []);

      for (const diagnostic of candidateDiagnostics) {
        const message = diagnosticMessage(diagnostic);
        const key = `${diagnostic.file}:${diagnostic.line}:${message}`;
        if (baselineKeys.has(key)) continue;
        const file = diagnostic.file ?? "unknown";
        if (!isChangedPath(file, changed)) continue;
        findings.push(createFinding({
          adapterId: "typescript",
          ruleId: "typescript-error",
          dimension: "analysability",
          severity: "block",
          confidence: 1,
          locations: [{ file, line: diagnostic.line, column: diagnostic.character }],
          evidenceRefs: evidenceRef(input.evidenceManifestId, `tsc:${key}`),
          explanation: message,
        }));
      }
      return findings;
    },
  };
}
