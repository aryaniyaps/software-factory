import type { Edge, Node } from "@xyflow/react";
import { FACTORY_NODE_NAMES, type FactoryNodeName, type NodeAttempt, type NodeVisualState } from "../types";

const NODE_WIDTH = 148;
const NODE_HEIGHT = 36;
const GAP_X = 24;
const GAP_Y = 72;

const MAIN_ROW: FactoryNodeName[] = [
  "prepare_repository",
  "create_worktree",
  "security_scan",
  "discovery_plan",
  "implement",
  "deterministic_checks",
  "maintainability_assess",
  "behavioral_verify",
  "review",
  "build_artifact",
  "release_controller",
];

function nodePosition(index: number, row = 0): { x: number; y: number } {
  return {
    x: index * (NODE_WIDTH + GAP_X),
    y: row * (NODE_HEIGHT + GAP_Y),
  };
}

const POSITIONS: Record<FactoryNodeName, { x: number; y: number }> = {
  prepare_repository: nodePosition(0),
  create_worktree: nodePosition(1),
  security_scan: nodePosition(2),
  discovery_plan: nodePosition(3),
  implement: nodePosition(4),
  deterministic_checks: nodePosition(5),
  maintainability_assess: nodePosition(6),
  behavioral_verify: nodePosition(7),
  review: nodePosition(8),
  build_artifact: nodePosition(9),
  release_controller: nodePosition(10),
  repair: {
    x: (nodePosition(5).x + nodePosition(6).x) / 2,
    y: NODE_HEIGHT + GAP_Y,
  },
};

export function formatNodeLabel(name: FactoryNodeName): string {
  return name.replace(/_/g, " ");
}

function latestAttemptByNode(attempts: NodeAttempt[]): Map<string, NodeAttempt> {
  const map = new Map<string, NodeAttempt>();
  for (const attempt of attempts) {
    const node = historicalNodeAlias(attempt.node);
    const existing = map.get(node);
    if (!existing || attempt.startedAt > existing.startedAt) {
      map.set(node, { ...attempt, node });
    }
  }
  return map;
}

export function buildNodeVisualStates(
  attempts: NodeAttempt[],
  currentNode?: string,
  runStatus?: string,
): Map<string, NodeVisualState> {
  const latest = latestAttemptByNode(attempts);
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    const node = historicalNodeAlias(attempt.node);
    counts.set(node, (counts.get(node) ?? 0) + 1);
  }

  const states = new Map<string, NodeVisualState>();
  const normalizedCurrentNode = currentNode ? historicalNodeAlias(currentNode) : undefined;
  for (const name of FACTORY_NODE_NAMES) {
    const attempt = latest.get(name);
    const isCurrent = normalizedCurrentNode === name && runStatus === "running";
    let status: NodeVisualState["status"] = "idle";

    if (isCurrent) {
      status = "running";
    } else if (attempt) {
      if (attempt.status === "succeeded") status = "succeeded";
      else if (attempt.status === "failed") status = "failed";
      else if (attempt.status === "cancelled") status = "cancelled";
    }

    states.set(name, {
      status,
      attemptCount: counts.get(name) ?? 0,
      isCurrent,
    });
  }
  return states;
}

export function buildFactoryGraph(
  visualStates: Map<string, NodeVisualState>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = FACTORY_NODE_NAMES.map((name) => {
    const visual = visualStates.get(name) ?? { status: "idle", attemptCount: 0, isCurrent: false };
    return {
      id: name,
      type: "factoryNode",
      position: POSITIONS[name],
      data: {
        label: formatNodeLabel(name),
        ...visual,
      },
      draggable: false,
      selectable: true,
    };
  });

  const edges: Edge[] = [
    ...MAIN_ROW.slice(0, -1).map((source, i) => ({
      id: `${source}->${MAIN_ROW[i + 1]}`,
      source,
      target: MAIN_ROW[i + 1]!,
      type: "smoothstep",
      animated: visualStates.get(MAIN_ROW[i + 1]!)?.isCurrent ?? false,
    })),
    { id: "deterministic_checks->repair", source: "deterministic_checks", target: "repair", type: "smoothstep", label: "fail" },
    { id: "repair->deterministic_checks", source: "repair", target: "deterministic_checks", type: "smoothstep", label: "retry" },
    { id: "maintainability_assess->repair", source: "maintainability_assess", target: "repair", type: "smoothstep", label: "fail" },
    { id: "repair->maintainability_assess", source: "repair", target: "maintainability_assess", type: "smoothstep", label: "retry" },
  ];

  return { nodes, edges };
}

export { NODE_WIDTH, NODE_HEIGHT };

function historicalNodeAlias(node: string): string {
  return node === "scout" || node === "plan" ? "discovery_plan" : node;
}
