import { resolve, normalize } from "node:path";

export const HIDDEN_SCENARIO_SEGMENTS = [
  "hidden-scenarios",
  "holdout-scenarios",
  ".factory/hidden",
  "factory/hidden-scenarios",
] as const;

export const IMPLEMENTER_DENIED_CREDENTIAL_MARKERS = [
  ".oracle-credentials",
  "verifier-prompts",
  "grader-secrets",
] as const;

export type FilesystemRole = "implementer" | "behavior_verifier" | "factory_orchestrator";

export function normalizePath(path: string): string {
  return normalize(resolve(path));
}

export function isHiddenScenarioPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return HIDDEN_SCENARIO_SEGMENTS.some((segment) => normalized.includes(segment))
    || IMPLEMENTER_DENIED_CREDENTIAL_MARKERS.some((marker) => normalized.includes(marker));
}

export function assertImplementerFilesystemAccess(role: FilesystemRole, path: string): void {
  if (role === "behavior_verifier" || role === "factory_orchestrator") return;
  if (isHiddenScenarioPath(path)) {
    throw new Error(`implementer denied hidden scenario path: ${path}`);
  }
}

export function assertImplementerToolAccess(role: FilesystemRole, tool: string, target?: string): void {
  if (role !== "implementer") return;
  const deniedTools = ["oracle", "hidden_scenario", "verifier_prompt"];
  if (deniedTools.includes(tool)) {
    throw new Error(`implementer denied tool: ${tool}`);
  }
  if (target) assertImplementerFilesystemAccess(role, target);
}

export function verifierSandboxMounts(hiddenRoot: string, worktreePath: string): readonly { source: string; target: string; readonly: boolean }[] {
  return [
    { source: worktreePath, target: "/workspace", readonly: false },
    { source: hiddenRoot, target: "/hidden-scenarios", readonly: true },
  ];
}
