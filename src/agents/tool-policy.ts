import { allToolNamesForHarness, harnessForRole } from "./role-harness-spec.js";

export function toolsForRole(role: string): string[] {
  try {
    return allToolNamesForHarness(harnessForRole(role));
  } catch {
    return [];
  }
}

export function mcpToolsForRole(role: string): string[] {
  const harness = harnessForRole(role);
  return harness.mcpServers.flatMap((server) => [...server.allowedTools]);
}
