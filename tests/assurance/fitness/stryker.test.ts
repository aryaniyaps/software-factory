import { describe, expect, it } from "vitest";
import { createStrykerAdapter } from "../../../src/assurance/fitness/adapters/stryker.js";
import { createMockRunner, fitnessInput, jsonOutcome, typescriptContext } from "./helpers.js";

describe("stryker adapter", () => {
  it("reports mutation score regression", async () => {
    const command = { command: "npx", args: ["stryker", "run", "--reporters", "json"] };
    const runner = createMockRunner({ npx: async () => jsonOutcome({ metrics: { mutationScore: 80 } }) });
    runner.run = async (spec) => {
      if (spec.cwd.endsWith("baseline")) return jsonOutcome({ metrics: { mutationScore: 80 } });
      return jsonOutcome({ metrics: { mutationScore: 55 } });
    };
    const adapter = createStrykerAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
    }));
    expect(findings.some((finding) => finding.ruleId === "stryker-mutation")).toBe(true);
  });
});
