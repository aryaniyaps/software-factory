import { describe, expect, it } from "vitest";
import { createSentruxAdapter } from "../../../src/assurance/fitness/adapters/sentrux.js";
import { FitnessRunner } from "../../../src/assurance/fitness/runner.js";
import { createMockRunner, fitnessInput, jsonOutcome, typescriptContext } from "./helpers.js";
import { parseFitnessPolicy } from "../../../src/assurance/fitness/policy.js";

describe("sentrux adapter", () => {
  const command = { command: "sentrux", args: ["gate", "--json"] };

  it("records aggregate degradation as shadow-only warning", async () => {
    const runner = createMockRunner({
      sentrux: async (spec) => {
        if (spec.cwd.endsWith("baseline")) {
          return jsonOutcome({ quality_signal: 7342, signal_after: 7342 });
        }
        return jsonOutcome({ quality_signal: 6891, signal_after: 6891, pass: false });
      },
    });
    const adapter = createSentruxAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
    }));
    const aggregate = findings.find((finding) => finding.ruleId === "sentrux-aggregate");
    expect(aggregate?.severity).toBe("warn");
    expect(aggregate?.shadowOnly).toBe(true);
    expect(aggregate?.delta).toBeLessThan(0);
  });

  it("does not block when only aggregate degrades under shadow policy", async () => {
    const policy = parseFitnessPolicy({
      schemaVersion: "fitness-policy.v1",
      policyVersion: "test",
      shadowMode: { enabled: true, successfulRunsRemaining: 30 },
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
      requiredCapabilities: ["modularity_graph"],
      hardRuleIds: ["dependency-cycle", "forbidden-dependency", "typescript-error"],
      shadowRuleIds: ["sentrux-aggregate"],
      adapters: { sentrux: command },
    });
    const runner = createMockRunner({
      sentrux: async (spec) => {
        if (spec.cwd.endsWith("baseline")) return jsonOutcome({ signal_after: 7342 });
        return jsonOutcome({ signal_after: 6891 });
      },
    });
    const fitnessRunner = new FitnessRunner({
      policy,
      runner,
      adapters: [createSentruxAdapter({ runner, command, execution: policy.execution })],
    });
    const result = await fitnessRunner.run(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
    }));
    expect(result.outcome).toBe("pass");
    expect(result.findings.some((finding) => finding.ruleId === "sentrux-aggregate")).toBe(true);
  });
});
