import { describe, expect, it } from "vitest";
import { parseAgentOutput } from "../../src/contracts/nodes.js";
import { profileForRole } from "../../src/agents/role-profiles.js";
import { toolsForRole } from "../../src/agents/tool-policy.js";
import {
  CRITIC_FORBIDDEN_TOOLS,
  CRITIC_READONLY_TOOLS,
  maintainabilityCriticRole,
} from "../../src/agents/roles/maintainability-critic.js";
import { stripImplementerNarrative } from "../../src/assurance/maintainability/critic.js";

describe("maintainability critic role isolation", () => {
  it("exposes read-only tools and forbids implementer write capabilities", () => {
    const tools = toolsForRole("maintainability_critic");
    expect(tools).toEqual(expect.arrayContaining([...CRITIC_READONLY_TOOLS]));
    for (const tool of CRITIC_FORBIDDEN_TOOLS) {
      expect(tools).not.toContain(tool);
    }
    expect(maintainabilityCriticRole.id).toBe("maintainability_critic");
  });

  it("does not share implementer skills or mental models", () => {
    const critic = profileForRole("maintainability_critic");
    const implementer = profileForRole("implement");
    expect(critic.skills).not.toEqual(implementer.skills);
    expect(critic.mentalModels).not.toContain("test-failures");
    expect(critic.mentalModels).toContain("architecture");
  });

  it("parses maintainability critic agent output with validated findings", () => {
    const output = parseAgentOutput({
      schemaVersion: "agent-output.v1",
      role: "maintainability_critic",
      status: "succeeded",
      summary: "one blocking invariant violation",
      evidenceRefs: ["ev-critic-1"],
      data: {
        report: {
          schemaVersion: "critic-report.v1",
          criticId: "critic-a",
          findings: [{
            id: "finding-1",
            category: "forbidden_direction",
            severity: "block",
            confidence: 0.95,
            dimension: "modularity",
            affectedSymbols: ["src/a.ts::foo"],
            evidenceRefs: ["ev-1", "ev-2"],
            violatedInvariant: "no upward imports",
            minimumRepair: "invert dependency",
            falsificationCondition: "dependency graph shows only allowed edges",
            explanation: "imports presentation from domain",
          }],
        },
      },
    });
    expect(output.role).toBe("maintainability_critic");
    expect(output.data.report).toBeDefined();
  });

  it("rejects critic output that leaks implementer narrative fields", () => {
    expect(() => stripImplementerNarrative({
      workOrderId: "wo-1",
      acceptanceIds: ["acc-1"],
      blueprintRefs: [],
      fitnessFindingRefs: [],
      diffRefs: [],
      graphRefs: [],
      behavioralEvidenceRefs: [],
      implementerNarrative: "trust me, this is fine",
    })).not.toThrow();
    const sanitized = stripImplementerNarrative({
      workOrderId: "wo-1",
      acceptanceIds: ["acc-1"],
      blueprintRefs: [],
      fitnessFindingRefs: [],
      diffRefs: [],
      graphRefs: [],
      behavioralEvidenceRefs: [],
      implementerNarrative: "trust me, this is fine",
    });
    expect(sanitized).not.toHaveProperty("implementerNarrative");
  });
});
