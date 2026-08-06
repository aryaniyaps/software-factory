import { assertWorkspaceMatchesPolicy } from "../security/capability-policy.js";
import { officialCrabboxRuntime, type CrabboxLease, type CrabboxRuntime } from "./crabbox-runtime.js";
import type { ExecOptions, ExecResult, WorkspaceProvider, WorkspaceSpec } from "./provider.js";

export class CrabboxWorkspaceProvider implements WorkspaceProvider {
  private readonly leases = new Map<string, CrabboxLease>();

  constructor(private readonly runtime: CrabboxRuntime = officialCrabboxRuntime) {}

  async create(spec: WorkspaceSpec): Promise<{ id: string }> {
    assertWorkspaceMatchesPolicy(spec);
    if (spec.privileged) throw new Error("privileged workspaces are not allowed");
    const lease = await this.runtime.warm(spec);
    this.leases.set(lease.id, lease);
    return { id: lease.id };
  }

  async exec(id: string, command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const lease = this.leases.get(id);
    if (!lease) throw new Error(`unknown workspace: ${id}`);
    return lease.exec([command, ...args], options);
  }

  async copyBack(id: string, paths: Array<{ from: string; to: string }>): Promise<void> {
    const lease = this.leases.get(id);
    if (!lease) throw new Error(`unknown workspace: ${id}`);
    await lease.copyBack(paths);
  }

  async destroy(id: string): Promise<void> {
    const lease = this.leases.get(id);
    if (!lease) return;
    this.leases.delete(id);
    await lease.stop();
  }
}
