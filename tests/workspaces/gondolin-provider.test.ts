import { describe, expect, it } from "vitest";
import { GondolinWorkspaceProvider, type GondolinVm } from "../../src/workspaces/gondolin-provider.js";

describe("GondolinWorkspaceProvider", () => {
  it("delegates lifecycle to the official VM adapter", async () => {
    const calls: string[] = [];
    const vm: GondolinVm = {
      id: "vm-1",
      exec: async () => { calls.push("exec"); return { exitCode: 0, stdout: "ok", stderr: "" }; },
      close: async () => { calls.push("close"); },
    };
    const provider = new GondolinWorkspaceProvider({ create: async () => vm });
    const workspace = await provider.create({ path: "/worktree", network: "none" });
    await expect(provider.exec(workspace.id, "node", ["-e", "ok"])).resolves.toMatchObject({ exitCode: 0 });
    await provider.destroy(workspace.id);
    expect(calls).toEqual(["exec", "close"]);
  });

  it("rejects privileged workspaces", async () => {
    const provider = new GondolinWorkspaceProvider({ create: async () => ({ id: "vm", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), close: async () => {} }) });
    await expect(provider.create({ path: "/worktree", network: "none", privileged: true })).rejects.toThrow("privileged");
  });
});
