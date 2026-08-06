import { describe, expect, it } from "vitest";
import { createDependencyCruiserAdapter } from "../../../src/assurance/fitness/adapters/dependency-cruiser.js";
import { createSentruxAdapter } from "../../../src/assurance/fitness/adapters/sentrux.js";
import { FitnessRunner } from "../../../src/assurance/fitness/runner.js";
import { parseFitnessPolicy } from "../../../src/assurance/fitness/policy.js";
import { createMockRunner, fitnessInput, jsonOutcome, pythonContext, typescriptContext } from "./helpers.js";

describe("fitness runner", () => {
  const depCommand = { command: "npx", args: ["depcruise", "--output-type", "json", "src"] };
  const sentruxCommand = { command: "sentrux", args: ["gate", "--json"] };

  function policyWith(capabilities: string[]) {
    return parseFitnessPolicy({
      schemaVersion: "fitness-policy.v1",
      policyVersion: "test",
      shadowMode: { enabled: true, successfulRunsRemaining: 30 },
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
      requiredCapabilities: capabilities,
      hardRuleIds: ["dependency-cycle", "forbidden-dependency", "typescript-error"],
      shadowRuleIds: ["sentrux-aggregate"],
      adapters: {
        "dependency-cruiser": depCommand,
        sentrux: sentruxCommand,
      },
    });
  }

  it("returns policy_block for a new dependency cycle", async () => {
    const runner = createMockRunner({ npx: async () => jsonOutcome([]), sentrux: async () => jsonOutcome({ signal_after: 7000 }) });
    runner.run = async (spec) => {
      if (spec.command === "sentrux") return jsonOutcome({ signal_after: 7000 });
      if (spec.cwd.endsWith("candidate")) {
        return jsonOutcome([{
          rule: { name: "no-circular" },
          cycle: ["src/a.ts", "src/b.ts", "src/a.ts"],
        }]);
      }
      return jsonOutcome([]);
    };
    const policy = policyWith(["architecture_rules", "modularity_graph"]);
    const fitnessRunner = new FitnessRunner({
      policy,
      runner,
      adapters: [
        createDependencyCruiserAdapter({ runner, command: depCommand, execution: policy.execution }),
        createSentruxAdapter({ runner, command: sentruxCommand, execution: policy.execution }),
      ],
    });
    const result = await fitnessRunner.run(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/a.ts"],
    }));
    expect(result.outcome).toBe("policy_block");
    expect(result.findings.some((finding) => finding.ruleId === "dependency-cycle")).toBe(true);
  });

  it("passes when sentrux aggregate alone degrades", async () => {
    const runner = createMockRunner({ npx: async () => jsonOutcome([]), sentrux: async () => jsonOutcome({ signal_after: 7000 }) });
    runner.run = async (spec) => {
      if (spec.command === "sentrux") {
        if (spec.cwd.endsWith("baseline")) return jsonOutcome({ signal_after: 7342 });
        return jsonOutcome({ signal_after: 6891 });
      }
      return jsonOutcome([]);
    };
    const policy = policyWith(["architecture_rules", "modularity_graph"]);
    const fitnessRunner = new FitnessRunner({
      policy,
      runner,
      adapters: [
        createDependencyCruiserAdapter({ runner, command: depCommand, execution: policy.execution }),
        createSentruxAdapter({ runner, command: sentruxCommand, execution: policy.execution }),
      ],
    });
    const result = await fitnessRunner.run(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
    }));
    expect(result.outcome).toBe("pass");
    expect(result.findings.some((finding) => finding.ruleId === "sentrux-aggregate")).toBe(true);
  });

  it("returns insufficient_evidence when a required capability is unavailable", async () => {
    const policy = policyWith(["architecture_rules", "modularity_graph"]);
    const runner = createMockRunner({});
    const fitnessRunner = new FitnessRunner({
      policy,
      runner,
      adapters: [
        createDependencyCruiserAdapter({ runner, command: depCommand, execution: policy.execution }),
        createSentruxAdapter({ runner, command: sentruxCommand, execution: policy.execution }),
      ],
    });
    const result = await fitnessRunner.run(fitnessInput(pythonContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
    }));
    expect(result.outcome).toBe("insufficient_evidence");
    expect(result.missingCapabilities.length).toBeGreaterThan(0);
  });

  it("stores raw sub-scores alongside findings", async () => {
    const runner = createMockRunner({ sentrux: async () => jsonOutcome({ signal_after: 7000 }) });
    runner.run = async (spec) => {
      if (spec.command === "sentrux") {
        if (spec.cwd.endsWith("baseline")) return jsonOutcome({ signal_after: 7342 });
        return jsonOutcome({ signal_after: 6891 });
      }
      return jsonOutcome([]);
    };
    const policy = policyWith(["modularity_graph"]);
    const fitnessRunner = new FitnessRunner({
      policy,
      runner,
      adapters: [createSentruxAdapter({ runner, command: sentruxCommand, execution: policy.execution })],
    });
    const result = await fitnessRunner.run(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
    }));
    expect(result.rawSubScores.some((score) => score.metric === "sentrux-aggregate")).toBe(true);
    expect(result.rawSubScores[0]?.baseline).toBe(7342);
    expect(result.rawSubScores[0]?.candidate).toBe(6891);
  });
});
