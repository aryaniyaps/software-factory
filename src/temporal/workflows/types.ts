import type { FactoryWorkflowInput } from "../client.js";

export interface FactoryWorkflowState {
  runId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  completedNodes: string[];
  failedNode?: string;
}

export const FACTORY_NODE_NAMES = [
  "prepare_repository",
  "create_worktree",
  "security_scan",
  "scout",
  "plan",
  "implement",
  "deterministic_checks",
  "repair",
  "review",
  "build_artifact",
  "deploy",
  "health_check",
] as const;

export type FactoryNodeName = (typeof FACTORY_NODE_NAMES)[number];
export type { FactoryWorkflowInput };
