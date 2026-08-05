import { RealFSProvider, VM } from "@earendil-works/gondolin";
import type { ExecOptions, ExecResult, WorkspaceProvider, WorkspaceSpec } from "./provider.js";

export interface GondolinVm {
  id: string;
  exec(command: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
  close(): Promise<void>;
}

export interface GondolinRuntime {
  create(spec: WorkspaceSpec): Promise<GondolinVm>;
}

export const officialGondolinRuntime: GondolinRuntime = {
  async create(spec) {
    return VM.create({
      sessionLabel: `factory ${spec.path}`,
      vfs: { mounts: { "/workspace": new RealFSProvider(spec.path) } },
    }) as unknown as GondolinVm;
  },
};

export class GondolinWorkspaceProvider implements WorkspaceProvider {
  private readonly vms = new Map<string, GondolinVm>();

  constructor(private readonly runtime: GondolinRuntime) {}

  async create(spec: WorkspaceSpec): Promise<{ id: string }> {
    if (spec.privileged) throw new Error("privileged workspaces are not allowed");
    const vm = await this.runtime.create(spec);
    this.vms.set(vm.id, vm);
    return { id: vm.id };
  }

  async exec(id: string, command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const vm = this.vms.get(id);
    if (!vm) throw new Error(`unknown workspace: ${id}`);
    return vm.exec([command, ...args], { cwd: options.cwd ?? "/workspace", timeout: options.timeoutMs });
  }

  async destroy(id: string): Promise<void> {
    const vm = this.vms.get(id);
    if (!vm) return;
    this.vms.delete(id);
    await vm.close();
  }
}
