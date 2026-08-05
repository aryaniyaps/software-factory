export type NodeKind = "deterministic" | "agent";
export type NodeStatus =
  | "pending"
  | "leased"
  | "running"
  | "succeeded"
  | "retrying"
  | "failed"
  | "cancelled";

export interface GraphNode {
  id: string;
  runId: string;
  kind: NodeKind;
  name: string;
  status: NodeStatus;
  attempt: number;
  input: unknown;
  output?: unknown;
  error?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function readyNodes(graph: WorkflowGraph): GraphNode[] {
  const nodes = new Map(graph.nodes.map((item) => [item.id, item]));
  const predecessors = new Map<string, string[]>();
  for (const edge of graph.edges) {
    predecessors.set(edge.to, [...(predecessors.get(edge.to) ?? []), edge.from]);
  }

  return graph.nodes
    .filter((item) => item.status === "pending")
    .filter((item) =>
      (predecessors.get(item.id) ?? []).every(
        (predecessor) => nodes.get(predecessor)?.status === "succeeded",
      ),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}
