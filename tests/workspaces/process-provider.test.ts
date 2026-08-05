import { describe, expect, it } from "vitest";
import { ProcessWorkspaceProvider } from "../../src/workspaces/process-provider.js";

describe("ProcessWorkspaceProvider", () => {
  it("runs an argv command in the requested working directory", async () => {
    const provider = new ProcessWorkspaceProvider();
    const workspace = await provider.create({ path: process.cwd(), network: "none" });
    const result = await provider.exec(workspace.id, process.execPath, ["-e", "process.stdout.write(process.cwd())"]);
    expect(result).toMatchObject({ exitCode: 0, stdout: process.cwd() });
    await provider.destroy(workspace.id);
  });

  it("rejects privileged workspace settings", async () => {
    const provider = new ProcessWorkspaceProvider();
    await expect(provider.create({ path: process.cwd(), network: "restricted", privileged: true })).rejects.toThrow("privileged");
  });
});
