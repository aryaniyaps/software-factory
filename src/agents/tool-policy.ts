const phaseTools: Record<string, string[]> = {
  scout: ["read", "grep", "find", "bash", "context7", "web_search"],
  plan: ["read", "grep", "find", "context7", "web_search"],
  implement: ["read", "grep", "find", "bash", "edit", "write"],
  repair: ["read", "grep", "find", "bash", "edit", "write"],
  review: ["read", "grep", "find", "bash"],
  deploy: [],
};

export function toolsForRole(role: string): string[] {
  return [...(phaseTools[role] ?? [])];
}
