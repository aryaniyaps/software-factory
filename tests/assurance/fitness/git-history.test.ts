import { describe, expect, it } from "vitest";
import { createGitHistoryAdapter } from "../../../src/assurance/fitness/adapters/git-history.js";
import { createMockRunner, fitnessInput, typescriptContext } from "./helpers.js";

describe("git-history adapter", () => {
  it("reports increased hotspot churn", async () => {
    const command = { command: "git", args: ["log", "--numstat"] };
    const runner = createMockRunner({ git: async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      outputTruncated: false,
    }) });
    runner.run = async (spec) => {
      if (spec.cwd.endsWith("baseline")) {
        return {
          exitCode: 0,
          stdout: "src/hot.ts\t3\t40",
          stderr: "",
          timedOut: false,
          outputTruncated: false,
        };
      }
      return {
        exitCode: 0,
        stdout: "src/hot.ts\t5\t90",
        stderr: "",
        timedOut: false,
        outputTruncated: false,
      };
    };
    const adapter = createGitHistoryAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/hot.ts"],
    }));
    expect(findings[0]?.ruleId).toBe("git-hotspot");
    expect(findings[0]?.delta).toBe(50);
  });
});
