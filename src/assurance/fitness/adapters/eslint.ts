import {
  createFinding,
  supportsTypeScript,
  type FitnessAdapter,
  type FitnessFinding,
  type FitnessInput,
  type RepositoryContext,
} from "../types.js";
import { type AdapterOptions, evidenceRef, isChangedPath, runAdapterCommand } from "./base.js";

interface EslintMessage {
  filePath?: string;
  line?: number;
  column?: number;
  ruleId?: string;
  message?: string;
  severity?: number;
}

function parseMessages(parsed: unknown): EslintMessage[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((fileResult) => {
    if (!fileResult || typeof fileResult !== "object") return [];
    const messages = (fileResult as { messages?: EslintMessage[] }).messages ?? [];
    const filePath = (fileResult as { filePath?: string }).filePath;
    return messages.map((message) => ({ ...message, filePath: message.filePath ?? filePath }));
  });
}

export function createEslintAdapter(options: AdapterOptions): FitnessAdapter {
  return {
    id: "eslint",
    version: "1.0.0",
    capability: "lint_conventions",
    async supports(context: RepositoryContext): Promise<boolean> {
      if (!supportsTypeScript(context)) return false;
      return options.runner.isAvailable(options.command.command, ["--version"]);
    },
    async measure(input: FitnessInput): Promise<readonly FitnessFinding[]> {
      const findings: FitnessFinding[] = [];
      const baselineMessages = input.baselineRoot
        ? parseMessages((await runAdapterCommand(options, input.baselineRoot)).parsed)
        : [];
      const candidateMessages = parseMessages(
        (await runAdapterCommand(options, input.candidateRoot)).parsed,
      );
      const baselineKeys = new Set(
        baselineMessages.map((entry) => `${entry.filePath}:${entry.line}:${entry.ruleId}`),
      );
      const changed = new Set(input.changedFiles ?? []);

      for (const message of candidateMessages) {
        const key = `${message.filePath}:${message.line}:${message.ruleId}`;
        if (baselineKeys.has(key)) continue;
        const file = message.filePath ?? "unknown";
        if (!isChangedPath(file, changed)) continue;
        const ruleId = message.ruleId?.includes("complexity") ? "eslint-complexity" : `eslint-${message.ruleId ?? "rule"}`;
        findings.push(createFinding({
          adapterId: "eslint",
          ruleId,
          dimension: "analysability",
          severity: ruleId === "eslint-complexity" ? "warn" : "warn",
          confidence: 0.7,
          locations: [{ file, line: message.line, column: message.column }],
          evidenceRefs: evidenceRef(input.evidenceManifestId, `eslint:${key}`),
          explanation: message.message ?? "ESLint finding",
          shadowOnly: ruleId === "eslint-complexity",
        }));
      }
      return findings;
    },
  };
}
