export interface WorkspaceSpec {
  path: string;
  network: "none" | "restricted";
  privileged?: boolean;
}

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface WorkspaceProvider {
  create(spec: WorkspaceSpec): Promise<{ id: string }>;
  exec(id: string, command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  destroy(id: string): Promise<void>;
}
