import type { Edge, Node } from "@xyflow/react";
import type { FactoryExecutionView } from "../types.js";

const NODE_WIDTH = 148;
const NODE_HEIGHT = 36;
const GAP_X = 24;
const GAP_Y = 72;

export function buildFactoryGraph(
  graph: FactoryExecutionView["graph"],
): { nodes: Node[]; edges: Edge[] } {
  const retrySources = new Set(
    graph.edges.filter((edge) => edge.condition === "retry").map((edge) => edge.source),
  );
  const mainNodes = graph.nodes.filter((node) => !retrySources.has(node.id));
  const mainIndex = new Map(mainNodes.map((node, index) => [node.id, index]));

  const nodes: Node[] = graph.nodes.map((definition, index) => {
    const retryRow = retrySources.has(definition.id);
    const xIndex = retryRow
      ? nearestConnectedIndex(definition.id, graph.edges, mainIndex, index)
      : (mainIndex.get(definition.id) ?? index);
    return {
      id: definition.id,
      type: "factoryNode",
      position: {
        x: xIndex * (NODE_WIDTH + GAP_X),
        y: retryRow ? NODE_HEIGHT + GAP_Y : 0,
      },
      data: {
        label: definition.label,
        kind: definition.kind,
        status: definition.status,
        attemptCount: definition.attemptCount,
        isCurrent: definition.status === "running",
      },
      draggable: false,
      selectable: true,
    };
  });

  const edges: Edge[] = graph.edges.map((definition) => ({
    id: definition.id,
    source: definition.source,
    target: definition.target,
    type: "smoothstep",
    label: definition.condition,
    animated: graph.nodes.some(
      (node) => node.id === definition.target && node.status === "running",
    ),
  }));

  return { nodes, edges };
}

function nearestConnectedIndex(
  nodeId: string,
  edges: FactoryExecutionView["graph"]["edges"],
  mainIndex: ReadonlyMap<string, number>,
  fallback: number,
): number {
  const positions = edges.flatMap((edge) => {
    if (edge.source === nodeId && mainIndex.has(edge.target)) return [mainIndex.get(edge.target)!];
    if (edge.target === nodeId && mainIndex.has(edge.source)) return [mainIndex.get(edge.source)!];
    return [];
  });
  if (positions.length === 0) return fallback;
  return positions.reduce((sum, value) => sum + value, 0) / positions.length;
}

export { NODE_WIDTH, NODE_HEIGHT };
