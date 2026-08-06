import { resolveCapabilityPolicy, workspaceSpecForRole, type FactorySandboxRole } from "../../security/capability-policy.js";
import type { ExecOptions, ExecResult, WorkspaceProvider } from "../../workspaces/provider.js";

export interface CrabboxActivityRuntime {
  createForWorktree(input: { path: string; sandboxProfile: string; role?: FactorySandboxRole }): Promise<{
    exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
    close(): Promise<void>;
  }>;
}

export function createCrabboxActivityRuntime(provider: WorkspaceProvider): CrabboxActivityRuntime {
  return {
    async createForWorktree(input) {
      if (input.sandboxProfile !== "crabbox") throw new Error(`unsupported sandbox profile: ${input.sandboxProfile}`);
      const role = input.role ?? "implementer";
      const spec = workspaceSpecForRole(input.path, role);
      const workspace = await provider.create(spec);
      let closed = false;
      return {
        exec: (command, args, options) => provider.exec(workspace.id, command, args, { cwd: "/workspace", ...options }),
        close: async () => {
          if (!closed) {
            closed = true;
            await provider.destroy(workspace.id);
          }
        },
      };
    },
  };
}

export function networkForRole(role: FactorySandboxRole): "none" | "restricted" {
  return resolveCapabilityPolicy(role).network;
}
