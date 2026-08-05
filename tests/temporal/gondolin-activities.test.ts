import { describe, expect, it } from "vitest";
import { createGondolinActivityRuntime } from "../../src/temporal/activities/gondolin.js";

describe("Gondolin Activity runtime", () => {
  it("creates restricted workspaces and always closes them", async () => {
    const calls: string[] = [];
    const runtime = createGondolinActivityRuntime({
      create: async (spec) => {
        expect(spec).toMatchObject({ path: "/worktree", network: "restricted", privileged: false });
        return { id: "vm-1" };
      },
      exec: async () => { calls.push("exec"); return { exitCode: 0, stdout: "ok", stderr: "" }; },
      destroy: async () => { calls.push("destroy"); },
    });
    const vm = await runtime.createForWorktree({ path: "/worktree", sandboxProfile: "gondolin" });
    await vm.exec("node", ["-e", "ok"]);
    await vm.close();
    expect(calls).toEqual(["exec", "destroy"]);
  });
});
