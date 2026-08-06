import { type AdapterCommandConfig, createFinding, type FitnessInput, type FitnessRawSubScore } from "../types.js";
import { type ProcessRunner, type ProcessSpec, parseJsonOutput } from "../process-runner.js";

export interface AdapterOptions {
  readonly runner: ProcessRunner;
  readonly command: AdapterCommandConfig;
  readonly execution: Pick<ProcessSpec, "timeoutMs" | "maxOutputBytes">;
}

export async function runAdapterCommand(
  options: AdapterOptions,
  root: string,
  extraArgs: readonly string[] = [],
): Promise<{ outcome: Awaited<ReturnType<ProcessRunner["run"]>>; parsed?: unknown }> {
  const result = await options.runner.run({
    command: options.command.command,
    args: [...options.command.args, ...extraArgs],
    cwd: root,
    timeoutMs: options.execution.timeoutMs,
    maxOutputBytes: options.execution.maxOutputBytes,
  });
  let parsed: unknown;
  try {
    parsed = parseJsonOutput(result.stdout, result.stderr);
  } catch {
    parsed = undefined;
  }
  return { outcome: result, parsed };
}

export function rawSubScore(
  adapterId: string,
  metric: string,
  raw: unknown,
  baseline?: number,
  candidate?: number,
): FitnessRawSubScore {
  const delta = baseline !== undefined && candidate !== undefined ? candidate - baseline : undefined;
  return { adapterId, metric, baseline, candidate, delta, raw };
}

export function evidenceRef(manifestId: string | undefined, suffix: string): string[] {
  return manifestId ? [`${manifestId}:${suffix}`] : [];
}

export function changedFileSet(input: FitnessInput): Set<string> {
  return new Set(input.changedFiles ?? []);
}

export function isChangedPath(path: string, changed: Set<string>): boolean {
  if (changed.size === 0) return true;
  return [...changed].some((entry) => path.includes(entry) || entry.includes(path));
}
