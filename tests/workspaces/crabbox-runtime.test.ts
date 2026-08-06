import { describe, expect, it } from "vitest";
import { createCrabboxRuntime, type CrabboxCommandRunner } from "../../src/workspaces/crabbox-runtime.js";

describe("Crabbox runtime", () => {
  it("warms, runs, and stops a local lease", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const runner: CrabboxCommandRunner = {
      run: async (file, args) => {
        calls.push({ file, args });
        return { exitCode: 0, stdout: "ok", stderr: "" };
      },
    };
    const runtime = createCrabboxRuntime(runner, { bin: "crabbox", slugPrefix: "factory" });

    const lease = await runtime.warm({ path: "/worktree", network: "restricted" });
    await expect(lease.exec(["npm", "test", "--", "--run"], { maxOutputBytes: 4 })).resolves.toEqual({ exitCode: 0, stdout: "ok", stderr: "" });
    await lease.stop();
    await lease.stop();

    expect(calls[0]).toMatchObject({ file: "crabbox", args: ["warmup", "--slug", expect.stringMatching(/^factory-worktree-/), "--keep"] });
    expect(calls[1]).toMatchObject({ file: "crabbox", args: ["run", "--id", calls[0].args[2], "--", "npm", "test", "--", "--run"] });
    expect(calls[2]).toMatchObject({ file: "crabbox", args: ["stop", calls[0].args[2]] });
  });

  it("copies back only declared paths", async () => {
    const calls: string[][] = [];
    const runtime = createCrabboxRuntime({
      run: async (_file, args) => {
        calls.push(args);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    }, { bin: "crabbox", slugPrefix: "factory" });

    const lease = await runtime.warm({ path: "/worktree", network: "restricted" });
    await lease.copyBack([{ from: "/workspace/result.json", to: "/worktree/result.json" }]);

    expect(calls.at(-1)).toEqual(["cp", "--id", calls[0][2], "/workspace/result.json", "/worktree/result.json"]);
  });
});
