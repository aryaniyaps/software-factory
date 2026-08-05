import type { ExecOptions, ExecResult, WorkspaceProvider, WorkspaceSpec } from "../../../src/workspaces/provider.js";

export class HttpSandboxProvider implements WorkspaceProvider {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}

  private headers(): HeadersInit {
    return { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) };
  }

  async create(spec: WorkspaceSpec): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/workspaces`, { method: "POST", headers: this.headers(), body: JSON.stringify(spec) });
    if (!response.ok) throw new Error(`sandbox create failed: ${response.status}`);
    return response.json() as Promise<{ id: string }>;
  }

  async exec(id: string, command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/workspaces/${encodeURIComponent(id)}/exec`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ command, args, options }),
    });
    if (!response.ok) throw new Error(`sandbox exec failed: ${response.status}`);
    return response.json() as Promise<ExecResult>;
  }

  async destroy(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/workspaces/${encodeURIComponent(id)}`, { method: "DELETE", headers: this.headers() });
    if (!response.ok) throw new Error(`sandbox destroy failed: ${response.status}`);
  }
}
