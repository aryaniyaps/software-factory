import { describe, expect, it } from "vitest";
import { createCrabboxActivityRuntime } from "../../src/temporal/activities/crabbox.js";
import type { WorkspaceProvider } from "../../src/workspaces/provider.js";

describe("Crabbox Activity runtime", () => {
  it("creates default-deny workspaces and closes them once", async () => {
    const calls: string[] = [];
    const provider: WorkspaceProvider = {
      create: async (spec) => {
        expect(spec).toMatchObject({ path: "/worktree", network: "none", privileged: false, role: "implementer" });
        return { id: "lease-1" };
      },
      exec: async () => { calls.push("exec"); return { exitCode: 0, stdout: "ok", stderr: "" }; },
      destroy: async () => { calls.push("destroy"); },
    };
    const runtime = createCrabboxActivityRuntime(provider);

    const vm = await runtime.createForWorktree({ path: "/worktree", sandboxProfile: "crabbox" });
    await vm.exec("npm", ["test"]);
    await vm.close();
    await vm.close();

    expect(calls).toEqual(["exec", "destroy"]);
  });

  it("uses builder network allowlist for artifact builds", async () => {
    const provider: WorkspaceProvider = {
      create: async (spec) => {
        expect(spec).toMatchObject({ network: "restricted", role: "builder" });
        return { id: "lease-1" };
      },
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      destroy: async () => {},
    };
    await expect(
      createCrabboxActivityRuntime(provider).createForWorktree({ path: "/worktree", sandboxProfile: "crabbox", role: "builder" }),
    ).resolves.toBeDefined();
  });

  it("rejects non-Crabbox profiles", async () => {
    const provider: WorkspaceProvider = { create: async () => ({ id: "lease" }), exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), destroy: async () => {} };
    await expect(createCrabboxActivityRuntime(provider).createForWorktree({ path: "/worktree", sandboxProfile: "legacy" })).rejects.toThrow("unsupported sandbox profile");
  });
});
