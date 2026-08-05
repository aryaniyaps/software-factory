import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function commandGate(input: {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<{ passed: boolean; exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execute(input.command, input.args ?? [], {
      cwd: input.cwd,
      timeout: input.timeoutMs ?? 120_000,
      maxBuffer: 1_000_000,
      shell: false,
    });
    return { passed: true, exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { passed: false, exitCode: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? String(error) };
  }
}
