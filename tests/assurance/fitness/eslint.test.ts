import { describe, expect, it } from "vitest";
import { createEslintAdapter } from "../../../src/assurance/fitness/adapters/eslint.js";
import { createMockRunner, fitnessInput, jsonOutcome, typescriptContext } from "./helpers.js";

describe("eslint adapter", () => {
  it("reports new complexity warnings in shadow mode", async () => {
    const command = { command: "npx", args: ["eslint", "-f", "json", "src"] };
    const runner = createMockRunner({ npx: async () => jsonOutcome([]) });
    runner.run = async (spec) => {
      if (spec.cwd.endsWith("candidate")) {
        return jsonOutcome([{
          filePath: "src/app.ts",
          messages: [{
            ruleId: "complexity",
            message: "Function has a complexity of 20.",
            line: 8,
            severity: 1,
          }],
        }]);
      }
      return jsonOutcome([]);
    };
    const adapter = createEslintAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/app.ts"],
    }));
    expect(findings[0]?.ruleId).toBe("eslint-complexity");
    expect(findings[0]?.shadowOnly).toBe(true);
  });
});
