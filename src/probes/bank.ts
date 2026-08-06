import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseProbeDefinition, type ProbeBank, type ProbeDefinition } from "./types.js";

export const HIDDEN_PROBE_SEGMENTS = [
  "hidden-probes",
  "holdout-probes",
  ".factory/hidden-probes",
  "factory/hidden-probes",
] as const;

export type ProbeFilesystemRole = "implementer" | "probe_verifier" | "factory_orchestrator";

export function isHiddenProbePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return HIDDEN_PROBE_SEGMENTS.some((segment) => normalized.includes(segment));
}

export function assertImplementerProbeAccess(role: ProbeFilesystemRole, path: string): void {
  if (role === "probe_verifier" || role === "factory_orchestrator") return;
  if (isHiddenProbePath(path)) {
    throw new Error(`implementer denied hidden probe path: ${path}`);
  }
}

export interface ProbeBankLoaderOptions {
  readonly hiddenRoot: string;
  readonly role?: ProbeFilesystemRole;
}

export async function loadProbeFile(path: string, options: ProbeBankLoaderOptions): Promise<ProbeDefinition> {
  if (options.role === "implementer" || !options.role) {
    assertImplementerProbeAccess("implementer", path);
  }
  if (isHiddenProbePath(path)) {
    assertImplementerProbeAccess(options.role ?? "implementer", path);
  }
  const raw = await readFile(path, "utf8");
  return parseProbeDefinition(parseYaml(raw));
}

export async function loadProbeBankFromRoot(
  root: string,
  options: ProbeBankLoaderOptions = { hiddenRoot: root },
): Promise<ProbeBank> {
  if (options.role === "implementer") {
    assertImplementerProbeAccess("implementer", root);
  }
  const indexPath = join(root, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as {
    bankVersion: string;
    probes: string[];
  };
  const probes: ProbeDefinition[] = [];
  for (const relative of index.probes) {
    const path = join(root, relative);
    probes.push(await loadProbeFile(path, { ...options, hiddenRoot: root }));
  }
  return {
    bankVersion: index.bankVersion,
    probes,
  };
}

export function sampleProbes(
  bank: ProbeBank,
  count: number,
  seed = 0,
): ProbeDefinition[] {
  if (count <= 0) return [];
  if (count >= bank.probes.length) return [...bank.probes];
  const ordered = [...bank.probes].sort((left, right) => left.id.localeCompare(right.id));
  const selected: ProbeDefinition[] = [];
  let cursor = Math.abs(seed) % ordered.length;
  while (selected.length < count) {
    const probe = ordered[cursor % ordered.length];
    if (!selected.some((entry) => entry.id === probe.id)) {
      selected.push(probe);
    }
    cursor += 1;
  }
  return selected;
}

export function assertProbeCodeNeverMergeable(mergeable: boolean): asserts mergeable is false {
  if (mergeable) {
    throw new Error("probe code must never be mergeable");
  }
}
