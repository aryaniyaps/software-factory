import { useMemo } from "react";
import { Background, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FactoryExecutionView } from "../types";
import { buildFactoryGraph } from "../graph/factory-graph";
import { FactoryNode } from "./FactoryNode";

const nodeTypes: NodeTypes = { factoryNode: FactoryNode };

export function PipelineGraph({ graph, selectedNode, onSelectNode, loading = false }: {
  graph: FactoryExecutionView["graph"] | null;
  selectedNode: string | null;
  onSelectNode: (node: string | null) => void;
  loading?: boolean;
}) {
  const built = useMemo(() => graph ? buildFactoryGraph(graph) : { nodes: [], edges: [] }, [graph]);
  const nodes = useMemo(() => built.nodes.map((node) => ({ ...node, selected: node.id === selectedNode })), [built.nodes, selectedNode]);
  if (loading) return <div className="graph-empty" aria-busy="true"><strong>Loading pipeline</strong>Querying Temporal…</div>;
  if (!graph) return <div className="graph-empty"><strong>No execution selected</strong>Pick an execution to query its graph.</div>;
  return <div className="graph-panel" aria-label="Factory pipeline graph"><ReactFlow nodes={nodes} edges={built.edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable onNodeClick={(_, node) => onSelectNode(node.id)} onPaneClick={() => onSelectNode(null)} proOptions={{ hideAttribution: true }}><Background gap={20} size={1} color="var(--sf-border)" /><Controls showInteractive={false} /></ReactFlow></div>;
}
