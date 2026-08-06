import { describe, expect, it } from "vitest";
import { assertCrabboxAvailable } from "../../src/workspaces/crabbox-doctor.js";
import type { CrabboxCommandRunner } from "../../src/workspaces/crabbox-runtime.js";

describe("Crabbox doctor", () => {
  it("accepts an available Crabbox executable", async () => {
    const runner: CrabboxCommandRunner = { run: async () => ({ exitCode: 0, stdout: "crabbox 1.0.0", stderr: "" }) };
    await expect(assertCrabboxAvailable(runner, "crabbox")).resolves.toBeUndefined();
  });

  it("reports an actionable error when Crabbox is unavailable", async () => {
    const runner: CrabboxCommandRunner = { run: async () => ({ exitCode: 1, stdout: "", stderr: "not found" }) };
    await expect(assertCrabboxAvailable(runner, "/missing/crabbox")).rejects.toThrow(/Crabbox is required.*\/missing\/crabbox/);
  });
});
