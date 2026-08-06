import { describe, expect, it } from "vitest";
import { createTypeScriptAdapter } from "../../../src/assurance/fitness/adapters/typescript.js";
import { createMockRunner, fitnessInput, jsonOutcome, pythonContext, typescriptContext } from "./helpers.js";

describe("typescript adapter", () => {
  const command = { command: "npx", args: ["tsc", "--noEmit"] };

  it("does not support non-typescript repositories", async () => {
    const runner = createMockRunner({ npx: async () => jsonOutcome([]) });
    const adapter = createTypeScriptAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    expect(await adapter.supports(pythonContext)).toBe(false);
  });

  it("blocks new type errors in changed files", async () => {
    const runner = createMockRunner({ npx: async () => jsonOutcome([]) });
    runner.run = async (spec) => {
      if (spec.cwd.endsWith("candidate")) {
        return jsonOutcome([{
          file: "src/app.ts",
          line: 12,
          character: 4,
          messageText: "Type 'string' is not assignable to type 'number'.",
        }]);
      }
      return jsonOutcome([]);
    };
    const adapter = createTypeScriptAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/app.ts"],
    }));
    expect(findings.some((finding) => finding.ruleId === "typescript-error" && finding.severity === "block")).toBe(true);
  });
});
