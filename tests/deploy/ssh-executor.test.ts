import { describe, expect, it } from "vitest";
import { SshExecutor } from "../../src/deploy/ssh-executor.js";

describe("SshExecutor", () => {
  it("uses fixed ssh argv and configured host aliases", async () => {
    let received: { file: string; args: string[] } | undefined;
    const executor = new SshExecutor({ hosts: ["production"], execFile: async (file, args) => { received = { file, args }; return { exitCode: 0, stdout: "", stderr: "" }; } });
    await executor.run("production", ["docker", "pull", "app@sha256:abc"]);
    expect(received).toEqual({ file: "ssh", args: ["production", "--", "docker", "pull", "app@sha256:abc"] });
    await expect(executor.run("attacker; rm -rf /", ["docker"])).rejects.toThrow("unknown deployment host");
  });
});
