import type { ExecOptions, ExecResult, WorkspaceProvider } from "../../workspaces/provider.js";

export interface GondolinActivityRuntime {
  createForWorktree(input: { path: string; sandboxProfile: string }): Promise<{
    exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
    close(): Promise<void>;
  }>;
}

export function createGondolinActivityRuntime(provider: WorkspaceProvider): GondolinActivityRuntime {
  return {
    async createForWorktree(input) {
      if (input.sandboxProfile !== "gondolin") throw new Error(`unsupported sandbox profile: ${input.sandboxProfile}`);
      const workspace = await provider.create({ path: input.path, network: "restricted", privileged: false });
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
