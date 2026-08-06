import { type ProcessOutcome, type ProcessSpec, ProcessRunner } from "../../../src/assurance/fitness/process-runner.js";
import type { FitnessInput, RepositoryContext } from "../../../src/assurance/fitness/types.js";

export function createMockRunner(
  handlers: Record<string, (spec: ProcessSpec) => Promise<ProcessOutcome>>,
): ProcessRunner {
  const run = async (spec: ProcessSpec): Promise<ProcessOutcome> => {
    const key = `${spec.command}:${spec.args.join(" ")}`;
    const handler = handlers[key] ?? handlers[spec.command];
    if (!handler) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `no handler for ${key}`,
        timedOut: false,
        outputTruncated: false,
      };
    }
    return handler(spec);
  };
  const isAvailable = async (command: string): Promise<boolean> => handlers[command] !== undefined;
  return { run, isAvailable } as ProcessRunner;
}

export const typescriptContext: RepositoryContext = {
  repoRoot: "/repo",
  languages: ["typescript"],
  primaryLanguage: "typescript",
};

export const pythonContext: RepositoryContext = {
  repoRoot: "/repo",
  languages: ["python"],
  primaryLanguage: "python",
};

export function fitnessInput(
  context: RepositoryContext,
  overrides: Partial<FitnessInput> = {},
): FitnessInput {
  return {
    context,
    candidateRoot: context.repoRoot,
    baselineRoot: context.repoRoot,
    changedFiles: [],
    evidenceManifestId: "manifest-1",
    ...overrides,
  };
}

export function jsonOutcome(data: unknown, exitCode = 0): ProcessOutcome {
  return {
    exitCode,
    stdout: JSON.stringify(data),
    stderr: "",
    timedOut: false,
    outputTruncated: false,
  };
}
