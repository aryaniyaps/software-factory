import { allToolsForRole, harnessForRole, mcpToolsForRole } from "./role-harness.js";

export function toolsForRole(role: string): string[] {
  try {
    return allToolsForRole(role);
  } catch {
    return [];
  }
}

export { mcpToolsForRole, harnessForRole };
