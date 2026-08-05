import { describe, expect, it } from "vitest";
import { mvpWorkflow } from "../../src/workflow/mvp-workflow.js";

describe("mvpWorkflow", () => {
  it("contains the complete vertical slice", () => {
    const names = mvpWorkflow.nodes.map((node) => node.name);
    expect(names).toEqual([
      "prepare_repository",
      "create_worktree",
      "security_scan",
      "scout",
      "plan",
      "implement",
      "deterministic_checks",
      "repair_loop",
      "review",
      "build_image",
      "deploy",
      "health_check",
    ]);
  });

  it("uses agent nodes only for judgment-heavy phases", () => {
    expect(mvpWorkflow.nodes.filter((node) => node.kind === "agent").map((node) => node.name)).toEqual([
      "scout",
      "plan",
      "implement",
      "repair_loop",
      "review",
    ]);
  });

  it("has no cyclic dependencies", () => {
    const edges = new Map<string, string[]>();
    for (const [from, to] of mvpWorkflow.edges) edges.set(from, [...(edges.get(from) ?? []), to]);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (name: string): boolean => {
      if (visiting.has(name)) return false;
      if (visited.has(name)) return true;
      visiting.add(name);
      if (!(edges.get(name) ?? []).every(visit)) return false;
      visiting.delete(name);
      visited.add(name);
      return true;
    };
    expect(mvpWorkflow.nodes.every((node) => visit(node.name))).toBe(true);
  });
});
