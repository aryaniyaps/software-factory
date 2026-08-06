import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseScenarioDefinition, type ScenarioDefinition } from "./types.js";
import { assertImplementerFilesystemAccess, isHiddenScenarioPath } from "./isolation.js";

export interface ScenarioLoaderOptions {
  readonly hiddenRoot: string;
  readonly role?: "implementer" | "behavior_verifier" | "factory_orchestrator";
}

export async function loadScenarioFile(path: string, options: ScenarioLoaderOptions): Promise<ScenarioDefinition> {
  if (options.role === "implementer" || !options.role) {
    assertImplementerFilesystemAccess("implementer", path);
  }
  if (isHiddenScenarioPath(path)) {
    assertImplementerFilesystemAccess(options.role ?? "implementer", path);
  }
  const raw = await readFile(path, "utf8");
  return parseScenarioDefinition(parseYaml(raw));
}

export async function loadScenariosFromRoot(root: string, options: ScenarioLoaderOptions = { hiddenRoot: root }): Promise<ScenarioDefinition[]> {
  if (options.role === "implementer") {
    assertImplementerFilesystemAccess("implementer", root);
  }
  const indexPath = join(root, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as { scenarios: string[] };
  const scenarios: ScenarioDefinition[] = [];
  for (const relative of index.scenarios) {
    const path = join(root, relative);
    scenarios.push(await loadScenarioFile(path, { ...options, hiddenRoot: root }));
  }
  return scenarios;
}

export function filterScenariosForAcceptance(
  scenarios: readonly ScenarioDefinition[],
  acceptanceIds: readonly string[],
): ScenarioDefinition[] {
  if (acceptanceIds.length === 0) return [...scenarios];
  const targets = new Set(acceptanceIds);
  return scenarios.filter((scenario) => scenario.acceptance.some((id) => targets.has(id)));
}
