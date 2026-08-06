import { describe, expect, it } from "vitest";
import { createCrabboxActivityRuntime } from "../../src/temporal/activities/crabbox.js";
import type { WorkspaceProvider } from "../../src/workspaces/provider.js";

describe("Crabbox Activity runtime", () => {
  it("creates restricted workspaces and closes them once", async () => {
    const calls: string[] = [];
    const provider: WorkspaceProvider = {
      create: async (spec) => { expect(spec).toMatchObject({ path: "/worktree", network: "restricted", privileged: false }); return { id: "lease-1" }; },
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

  it("rejects non-Crabbox profiles", async () => {
    const provider: WorkspaceProvider = { create: async () => ({ id: "lease" }), exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), destroy: async () => {} };
    await expect(createCrabboxActivityRuntime(provider).createForWorktree({ path: "/worktree", sandboxProfile: "gondolin" })).rejects.toThrow("unsupported sandbox profile");
  });
});
