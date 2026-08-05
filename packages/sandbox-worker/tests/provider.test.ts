import { describe, expect, it, vi } from "vitest";
import { HttpSandboxProvider } from "../src/provider.js";

describe("HttpSandboxProvider", () => {
  it("creates, executes, and destroys a sandbox workspace", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sandbox-1" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ exitCode: 0, stdout: "ok", stderr: "" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = new HttpSandboxProvider("http://sandbox.test");
    const workspace = await provider.create({ path: "/worktree", network: "none" });
    await expect(provider.exec(workspace.id, "node", ["-e", "ok"])).resolves.toEqual({ exitCode: 0, stdout: "ok", stderr: "" });
    await provider.destroy(workspace.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });
});
