import type { AgentRole } from "../contracts/nodes.js";

const PHASE_TOOLS: Record<AgentRole, readonly string[]> = {
  scout: ["read", "grep", "find", "ls", "context7", "web_search"],
  plan: ["read", "grep", "find", "ls", "context7", "web_search"],
  implement: ["read", "bash", "edit", "write", "grep", "find", "ls", "context7"],
  repair: ["read", "bash", "edit", "write", "grep", "find", "ls", "context7", "web_search"],
  review: ["read", "grep", "find", "ls", "context7", "web_search"],
  maintainability_critic: ["read", "grep", "find", "ls", "context7"],
};

export function toolsForRole(role: string): string[] {
  return [...(PHASE_TOOLS[role as AgentRole] ?? [])];
}
