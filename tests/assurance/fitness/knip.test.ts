import { describe, expect, it } from "vitest";
import { createKnipAdapter } from "../../../src/assurance/fitness/adapters/knip.js";
import { createMockRunner, fitnessInput, jsonOutcome, typescriptContext } from "./helpers.js";

describe("knip adapter", () => {
  it("reports newly unused exports", async () => {
    const command = { command: "npx", args: ["knip", "--reporter", "json"] };
    const runner = createMockRunner({ npx: async () => jsonOutcome({}) });
    runner.run = async (spec) => {
      if (spec.cwd.endsWith("candidate")) {
        return jsonOutcome({ exports: [{ file: "src/unused.ts", name: "unusedFn" }] });
      }
      return jsonOutcome({});
    };
    const adapter = createKnipAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/unused.ts"],
    }));
    expect(findings[0]?.ruleId).toBe("knip-unused");
  });
});
