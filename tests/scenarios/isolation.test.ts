import { describe, expect, it } from "vitest";
import {
  assertImplementerFilesystemAccess,
  assertImplementerToolAccess,
  isHiddenScenarioPath,
  verifierSandboxMounts,
} from "../../src/scenarios/isolation.js";
import { loadScenarioFile } from "../../src/scenarios/loader.js";

describe("scenario isolation", () => {
  it("denies implementer access to hidden scenario roots and credentials", () => {
    expect(isHiddenScenarioPath("/factory/hidden-scenarios/SCN-API.yaml")).toBe(true);
    expect(isHiddenScenarioPath("/repo/src/app.ts")).toBe(false);

    expect(() => assertImplementerFilesystemAccess("implementer", "/data/holdout-scenarios/index.json"))
      .toThrow(/implementer denied hidden scenario path/i);
    expect(() => assertImplementerToolAccess("implementer", "oracle", "/factory/.oracle-credentials"))
      .toThrow(/implementer denied tool/i);
    expect(() => assertImplementerFilesystemAccess("implementer", "/factory/verifier-prompts/latest.txt"))
      .toThrow(/implementer denied hidden scenario path/i);
  });

  it("allows verifier access to hidden scenario mounts in a separate sandbox", () => {
    expect(() => assertImplementerFilesystemAccess("behavior_verifier", "/factory/hidden-scenarios/SCN-1.yaml"))
      .not.toThrow();
    const mounts = verifierSandboxMounts("/oracle/hidden", "/worktrees/run-1");
    expect(mounts).toEqual([
      { source: "/worktrees/run-1", target: "/workspace", readonly: false },
      { source: "/oracle/hidden", target: "/hidden-scenarios", readonly: true },
    ]);
  });

  it("blocks implementer scenario file reads through the loader", async () => {
    const fixture = new URL("./fixtures/hidden-scenarios/behavior-api.yaml", import.meta.url).pathname;
    await expect(loadScenarioFile(fixture, { hiddenRoot: fixture, role: "implementer" }))
      .rejects.toThrow(/implementer denied hidden scenario path/i);
  });
});
