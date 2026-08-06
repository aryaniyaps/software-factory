import { describe, expect, it } from "vitest";
import { createDependencyCruiserAdapter } from "../../../src/assurance/fitness/adapters/dependency-cruiser.js";
import { createMockRunner, fitnessInput, jsonOutcome, typescriptContext } from "./helpers.js";

describe("dependency-cruiser adapter", () => {
  const command = { command: "npx", args: ["depcruise", "--output-type", "json", "src"] };

  it("blocks a new dependency cycle", async () => {
    const runner = createMockRunner({
      npx: async () => jsonOutcome([]),
    });
    const adapter = createDependencyCruiserAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    expect(await adapter.supports(typescriptContext)).toBe(true);

    runner.run = async (spec) => {
      if (spec.cwd === spec.cwd && spec.args.includes("json")) {
        const cycle = ["src/a.ts", "src/b.ts", "src/a.ts"];
        if (spec.cwd.endsWith("baseline")) {
          return jsonOutcome([]);
        }
        return jsonOutcome([{
          rule: { name: "no-circular", severity: "error" },
          cycle,
        }]);
      }
      return jsonOutcome([]);
    };

    const input = fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/a.ts"],
    });
    const findings = await adapter.measure(input);
    expect(findings.some((finding) => finding.ruleId === "dependency-cycle" && finding.severity === "block")).toBe(true);
  });

  it("blocks a new forbidden dependency", async () => {
    const runner = createMockRunner({ npx: async () => jsonOutcome([]) });
    runner.run = async (spec) => {
      if (spec.cwd.endsWith("candidate")) {
        return jsonOutcome([{
          rule: { name: "not-to-internal", severity: "error" },
          from: "src/app.ts",
          to: "src/core/internal.ts",
        }]);
      }
      return jsonOutcome([]);
    };
    const adapter = createDependencyCruiserAdapter({
      runner,
      command,
      execution: { timeoutMs: 1000, maxOutputBytes: 1000 },
    });
    const findings = await adapter.measure(fitnessInput(typescriptContext, {
      baselineRoot: "/repo/baseline",
      candidateRoot: "/repo/candidate",
      changedFiles: ["src/app.ts"],
    }));
    expect(findings.some((finding) => finding.ruleId === "forbidden-dependency")).toBe(true);
  });
});
