import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseMaintainabilityPolicy } from "./policy.js";

export async function loadMaintainabilityPolicy(path: string) {
  const raw = await readFile(path, "utf8");
  return parseMaintainabilityPolicy(parseYaml(raw));
}

export function defaultMaintainabilityPolicyPath(): string {
  return fileURLToPath(new URL("../../../factory/maintainability/default.yaml", import.meta.url));
}
