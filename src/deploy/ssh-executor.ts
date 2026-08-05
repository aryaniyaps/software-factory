import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

export interface SshResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type ExecFile = (file: string, args: string[], options?: { timeout?: number }) => Promise<SshResult>;

export class SshExecutor {
  private readonly execFile: ExecFile;

  constructor(private readonly options: { hosts: string[]; execFile?: ExecFile }) {
    this.execFile = options.execFile ?? (promisify(nodeExecFile) as unknown as ExecFile);
  }

  async run(host: string, args: string[], timeoutMs = 120_000): Promise<SshResult> {
    if (!this.options.hosts.includes(host)) throw new Error(`unknown deployment host: ${host}`);
    const result = await this.execFile("ssh", [host, "--", ...args], { timeout: timeoutMs });
    if (result.exitCode !== 0) throw new Error(`ssh command failed: ${result.stderr}`);
    return result;
  }
}
