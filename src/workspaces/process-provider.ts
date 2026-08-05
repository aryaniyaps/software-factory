import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecOptions, ExecResult, WorkspaceProvider, WorkspaceSpec } from "./provider.js";

const execute = promisify(execFile);

interface ProcessWorkspace {
  path: string;
}

export class ProcessWorkspaceProvider implements WorkspaceProvider {
  private readonly workspaces = new Map<string, ProcessWorkspace>();
  private nextId = 1;

  async create(spec: WorkspaceSpec): Promise<{ id: string }> {
    if (spec.privileged) throw new Error("privileged workspaces are not allowed");
    const id = `process-${this.nextId++}`;
    this.workspaces.set(id, { path: spec.path });
    return { id };
  }

  async exec(id: string, command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new Error(`unknown workspace: ${id}`);
    const maxBuffer = options.maxOutputBytes ?? 1_000_000;
    try {
      const result = await execute(command, args, {
        cwd: options.cwd ?? workspace.path,
        timeout: options.timeoutMs ?? 120_000,
        maxBuffer,
        shell: false,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const failure = error as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean };
      return {
        exitCode: typeof failure.code === "number" ? failure.code : failure.killed ? 124 : 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? String(error),
      };
    }
  }

  async destroy(id: string): Promise<void> {
    this.workspaces.delete(id);
  }
}
