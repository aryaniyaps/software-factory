import { execFile as nodeExecFile } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { ExecOptions, ExecResult, WorkspaceSpec } from "./provider.js";

const execFile = promisify(nodeExecFile);

export interface CrabboxCommandRunner {
  run(file: string, args: string[], options?: { timeoutMs?: number }): Promise<ExecResult>;
}

export interface CrabboxLease {
  readonly id: string;
  exec(command: string[], options?: ExecOptions): Promise<ExecResult>;
  copyBack(paths: Array<{ from: string; to: string }>): Promise<void>;
  stop(): Promise<void>;
}

export interface CrabboxRuntime {
  warm(spec: WorkspaceSpec): Promise<CrabboxLease>;
}

function limitOutput(value: string, maxOutputBytes?: number): string {
  return maxOutputBytes === undefined ? value : value.slice(0, maxOutputBytes);
}

function leaseSlug(path: string, prefix: string): string {
  const name = basename(path).replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "") || "worktree";
  const hash = createHash("sha1").update(path).digest("hex").slice(0, 8);
  return `${prefix}-${name}-${hash}`;
}

export function createCrabboxRuntime(
  runner: CrabboxCommandRunner,
  options: { bin?: string; slugPrefix?: string } = {},
): CrabboxRuntime {
  const bin = options.bin ?? process.env.CRABBOX_BIN ?? "crabbox";
  const slugPrefix = options.slugPrefix ?? process.env.CRABBOX_SLUG_PREFIX ?? "software-factory";

  return {
    async warm(spec) {
      const id = leaseSlug(spec.path, slugPrefix);
      const warmed = await runner.run(bin, ["warmup", "--slug", id, "--keep"]);
      if (warmed.exitCode !== 0) throw new Error(`Crabbox warmup failed for ${id}: ${warmed.stderr || warmed.stdout}`);
      let stopped = false;
      let invalid = false;
      return {
        id,
        async exec(command, execOptions = {}) {
          if (stopped || invalid) throw new Error(`Crabbox lease is unavailable: ${id}`);
          const result = await runner.run(bin, ["run", "--id", id, "--", ...command], { timeoutMs: execOptions.timeoutMs });
          const bounded = { ...result, stdout: limitOutput(result.stdout, execOptions.maxOutputBytes), stderr: limitOutput(result.stderr, execOptions.maxOutputBytes) };
          if (result.exitCode !== 0 && execOptions.timeoutMs !== undefined && /timed out|timeout/i.test(result.stderr)) invalid = true;
          return bounded;
        },
        async copyBack(paths) {
          if (stopped || invalid) throw new Error(`Crabbox lease is unavailable: ${id}`);
          for (const { from, to } of paths) {
            if (!from.startsWith("/") || !to.startsWith("/")) throw new Error("Crabbox copy-back paths must be absolute");
            const result = await runner.run(bin, ["cp", "--id", id, from, to]);
            if (result.exitCode !== 0) throw new Error(`Crabbox copy-back failed for ${from}: ${result.stderr || result.stdout}`);
          }
        },
        async stop() {
          if (stopped) return;
          stopped = true;
          await runner.run(bin, ["stop", id]);
        },
      };
    },
  };
}

export const officialCrabboxRuntime = createCrabboxRuntime({
  async run(file, args, options = {}) {
    try {
      const result = await execFile(file, args, { timeout: options.timeoutMs, maxBuffer: 4 * 1024 * 1024 });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: string | number };
      return {
        exitCode: typeof failure.code === "number" ? failure.code : 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? failure.message,
      };
    }
  },
});
