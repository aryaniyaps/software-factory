import { describe, expect, it } from "vitest";
import { CrabboxWorkspaceProvider } from "../../src/workspaces/crabbox-provider.js";
import type { CrabboxLease, CrabboxRuntime } from "../../src/workspaces/crabbox-runtime.js";

describe("CrabboxWorkspaceProvider", () => {
  it("delegates workspace lifecycle to a Crabbox lease", async () => {
    const calls: string[] = [];
    const lease: CrabboxLease = {
      id: "lease-1",
      exec: async () => { calls.push("exec"); return { exitCode: 0, stdout: "ok", stderr: "" }; },
      copyBack: async () => { calls.push("copyBack"); },
      stop: async () => { calls.push("stop"); },
    };
    const runtime: CrabboxRuntime = { warm: async () => lease };
    const provider = new CrabboxWorkspaceProvider(runtime);

    const workspace = await provider.create({ path: "/worktree", network: "restricted" });
    await expect(provider.exec(workspace.id, "npm", ["test"])).resolves.toMatchObject({ exitCode: 0 });
    await provider.destroy(workspace.id);

    expect(calls).toEqual(["exec", "stop"]);
  });

  it("rejects privileged workspaces and unknown IDs", async () => {
    const runtime: CrabboxRuntime = { warm: async () => ({ id: "lease", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), copyBack: async () => {}, stop: async () => {} }) };
    const provider = new CrabboxWorkspaceProvider(runtime);

    await expect(provider.create({ path: "/worktree", network: "restricted", privileged: true })).rejects.toThrow("privileged");
    await expect(provider.exec("missing", "npm", ["test"])).rejects.toThrow("unknown workspace");
  });
});
