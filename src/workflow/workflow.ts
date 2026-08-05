import type { WorkflowNode } from "./node.js";

export interface WorkflowDefinition {
  name: string;
  nodes: WorkflowNode[];
  edges: Array<[string, string]>;
}
