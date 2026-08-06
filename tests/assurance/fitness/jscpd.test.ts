import { describe, expect, it } from "vitest";
import { createJscpdAdapter } from "../../../src/assurance/fitness/adapters/jscpd.js";
import { createMockRunner, fitnessInput, jsonOutcome, typescriptContext } from "./helpers.js";

describe("jscpd adapter", () => {
  it("reports new clone candidates", async () => {
    const command = { command: "npx", args: ["jscpd", "--reporters", "json", "src"] };
    const runner = createMockRunner({ npx: async () => jsonOutcome({ duplicates: [] }) });
    runner.run = async (spec) => {
      if (spec.cwd.endsWith("candidate")) {
        return jsonOutcome({
          duplicates: [{
            firstFile: { name: "src/a.ts" },
            secondFile: { name: "src/b.ts" },
            lines: 12,
          }],
        });
      }
      return jsonOutcome({ duplicates: [] });
    };
    const adapter = createJscpdAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/a.ts"],
    }));
    expect(findings[0]?.ruleId).toBe("jscpd-clone");
  });
});
