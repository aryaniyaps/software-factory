import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

const defaultExec = promisify(nodeExecFile);

export interface ProcessSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface ProcessOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly outputTruncated: boolean;
}

export type ExecFileFn = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

function truncateOutput(value: string, maxBytes: number): { text: string; truncated: boolean } {
  if (value.length <= maxBytes) return { text: value, truncated: false };
  return { text: value.slice(0, maxBytes), truncated: true };
}

export class ProcessRunner {
  constructor(private readonly execFile: ExecFileFn = defaultExec as ExecFileFn) {}

  async run(spec: ProcessSpec): Promise<ProcessOutcome> {
    try {
      const result = await this.execFile(spec.command, [...spec.args], {
        cwd: spec.cwd,
        timeout: spec.timeoutMs,
        maxBuffer: spec.maxOutputBytes,
      });
      const stdout = truncateOutput(result.stdout, spec.maxOutputBytes);
      const stderr = truncateOutput(result.stderr, spec.maxOutputBytes);
      return {
        exitCode: 0,
        stdout: stdout.text,
        stderr: stderr.text,
        timedOut: false,
        outputTruncated: stdout.truncated || stderr.truncated,
      };
    } catch (error) {
      const failure = error as {
        code?: string | number;
        stdout?: string;
        stderr?: string;
      };
      const stdout = truncateOutput(failure.stdout ?? "", spec.maxOutputBytes);
      const stderr = truncateOutput(failure.stderr ?? String(error), spec.maxOutputBytes);
      return {
        exitCode: typeof failure.code === "number" ? failure.code : 1,
        stdout: stdout.text,
        stderr: stderr.text,
        timedOut: failure.code === "ETIMEDOUT",
        outputTruncated: stdout.truncated || stderr.truncated,
      };
    }
  }

  async isAvailable(command: string, args: readonly string[] = ["--version"]): Promise<boolean> {
    const result = await this.run({
      command,
      args,
      cwd: process.cwd(),
      timeoutMs: 5_000,
      maxOutputBytes: 10_000,
    });
    return result.exitCode === 0 && !result.timedOut;
  }
}

export function parseJsonOutput(stdout: string, stderr: string): unknown {
  const candidates = [stdout.trim(), stderr.trim()].filter(Boolean);
  for (const candidate of candidates) {
    const jsonStart = candidate.indexOf("{");
    const arrayStart = candidate.indexOf("[");
    const start = jsonStart >= 0 && arrayStart >= 0
      ? Math.min(jsonStart, arrayStart)
      : jsonStart >= 0
        ? jsonStart
        : arrayStart;
    if (start < 0) continue;
    try {
      return JSON.parse(candidate.slice(start));
    } catch {
      continue;
    }
  }
  throw new Error("Adapter output did not contain valid JSON");
}
