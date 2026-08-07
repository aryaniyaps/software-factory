import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeAttemptStatus } from "../types";

export interface FactoryNodeData {
  label: string;
  status: NodeAttemptStatus;
  attemptCount: number;
  isCurrent: boolean;
}

function FactoryNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as FactoryNodeData;
  const statusClass = nodeData.isCurrent ? "status-running" : `status-${nodeData.status}`;

  return (
    <div className={`factory-node ${statusClass}${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div>{nodeData.label}</div>
      {nodeData.attemptCount > 0 && (
        <span className="attempt-badge">{nodeData.attemptCount} attempt{nodeData.attemptCount !== 1 ? "s" : ""}</span>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export const FactoryNode = memo(FactoryNodeComponent);
