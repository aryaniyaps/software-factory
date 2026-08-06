import type { AdapterOptions } from "./base.js";
import { createDependencyCruiserAdapter } from "./dependency-cruiser.js";
import { createEslintAdapter } from "./eslint.js";
import { createGitHistoryAdapter } from "./git-history.js";
import { createJscpdAdapter } from "./jscpd.js";
import { createKnipAdapter } from "./knip.js";
import { createSentruxAdapter } from "./sentrux.js";
import { createStrykerAdapter } from "./stryker.js";
import { createTypeScriptAdapter } from "./typescript.js";
import type { FitnessAdapter } from "../types.js";

const ADAPTER_FACTORIES: Record<string, (options: AdapterOptions) => FitnessAdapter> = {
  "dependency-cruiser": createDependencyCruiserAdapter,
  sentrux: createSentruxAdapter,
  typescript: createTypeScriptAdapter,
  eslint: createEslintAdapter,
  knip: createKnipAdapter,
  jscpd: createJscpdAdapter,
  stryker: createStrykerAdapter,
  "git-history": createGitHistoryAdapter,
};

export function createFitnessAdapters(
  policyAdapters: Readonly<Record<string, { command: string; args: readonly string[] }>>,
  runner: AdapterOptions["runner"],
  execution: AdapterOptions["execution"],
): FitnessAdapter[] {
  const adapters: FitnessAdapter[] = [];
  for (const [adapterId, command] of Object.entries(policyAdapters)) {
    const factory = ADAPTER_FACTORIES[adapterId];
    if (!factory) continue;
    adapters.push(factory({ runner, command, execution }));
  }
  return adapters;
}

export {
  createDependencyCruiserAdapter,
  createEslintAdapter,
  createGitHistoryAdapter,
  createJscpdAdapter,
  createKnipAdapter,
  createSentruxAdapter,
  createStrykerAdapter,
  createTypeScriptAdapter,
};
