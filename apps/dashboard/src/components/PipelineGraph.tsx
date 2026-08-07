import { useMemo } from "react";
import { Background, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { RunGraph } from "../types";
import { buildFactoryGraph, buildNodeVisualStates } from "../graph/factory-graph";
import { FactoryNode } from "./FactoryNode";

const nodeTypes: NodeTypes = {
  factoryNode: FactoryNode,
};

interface PipelineGraphProps {
  graph: RunGraph | null;
  currentNode?: string;
  selectedNode: string | null;
  onSelectNode: (node: string | null) => void;
  loading?: boolean;
}

export function PipelineGraph({
  graph,
  currentNode,
  selectedNode,
  onSelectNode,
  loading = false,
}: PipelineGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const visualStates = buildNodeVisualStates(
      graph?.attempts ?? [],
      graph?.status === "running" ? currentNode : undefined,
      graph?.status,
    );
    return buildFactoryGraph(visualStates);
  }, [graph, currentNode]);

  const flowNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedNode })),
    [nodes, selectedNode],
  );

  if (loading) {
    return (
      <div className="graph-empty" aria-busy="true">
        <strong>Loading pipeline</strong>
        Fetching graph and attempts for this run…
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="graph-empty">
        <strong>No run selected</strong>
        Pick a run from the list, or create a task to start one. Click a node to set the rerun target.
      </div>
    );
  }

  return (
    <div className="graph-panel" aria-label="Factory pipeline graph">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="var(--sf-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
