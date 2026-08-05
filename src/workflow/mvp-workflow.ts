import type { WorkflowNode } from "./node.js";
import type { WorkflowDefinition } from "./workflow.js";

const phases: Array<[string, "deterministic" | "agent"]> = [
  ["prepare_repository", "deterministic"],
  ["create_worktree", "deterministic"],
  ["security_scan", "deterministic"],
  ["scout", "agent"],
  ["plan", "agent"],
  ["implement", "agent"],
  ["deterministic_checks", "deterministic"],
  ["repair_loop", "agent"],
  ["review", "agent"],
  ["build_image", "deterministic"],
  ["deploy", "deterministic"],
  ["health_check", "deterministic"],
];

const node = (name: string, kind: "deterministic" | "agent"): WorkflowNode => ({
  name,
  kind,
  run: async (input) => input,
});

export const mvpWorkflow: WorkflowDefinition = {
  name: "mvp",
  nodes: phases.map(([name, kind]) => node(name, kind)),
  edges: phases.slice(0, -1).map(([name], index) => [name, phases[index + 1][0]]),
};
