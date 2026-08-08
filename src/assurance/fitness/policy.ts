import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  type AdapterCommandConfig,
  type FitnessCapability,
  type FitnessPolicy,
  MAINTAINABILITY_DIMENSIONS,
} from "./types.js";

const CAPABILITIES: readonly FitnessCapability[] = [
  "architecture_rules",
  "modularity_graph",
  "type_surface",
  "lint_conventions",
  "dead_code",
  "clone_detection",
  "mutation_testing",
  "change_history",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid fitness policy: ${field} must be a string array`);
  }
  return value.map((entry, index) => {
    if (typeof entry === "string") return entry;
    if (entry === null || entry === undefined) return "";
    if (typeof entry === "boolean" || typeof entry === "number") return String(entry);
    throw new Error(`Invalid fitness policy: ${field}[${index}] must be a string`);
  });
}

function asCapabilities(value: unknown): FitnessCapability[] {
  const entries = asStringArray(value, "requiredCapabilities");
  for (const entry of entries) {
    if (!CAPABILITIES.includes(entry as FitnessCapability)) {
      throw new Error(`Invalid fitness policy capability: ${entry}`);
    }
  }
  return entries as FitnessCapability[];
}

export function parseFitnessPolicy(value: unknown): FitnessPolicy {
  if (!isRecord(value)) throw new Error("Invalid fitness policy: expected object");
  if (value.schemaVersion !== "fitness-policy.v1") {
    throw new Error("Invalid fitness policy schemaVersion");
  }
  if (typeof value.policyVersion !== "string" || value.policyVersion.length === 0) {
    throw new Error("Invalid fitness policy: policyVersion required");
  }
  if (!isRecord(value.shadowMode)) throw new Error("Invalid fitness policy: shadowMode required");
  if (!isRecord(value.execution)) throw new Error("Invalid fitness policy: execution required");
  if (!isRecord(value.adapters)) throw new Error("Invalid fitness policy: adapters required");

  const adapters: Record<string, AdapterCommandConfig> = {};
  for (const [adapterId, config] of Object.entries(value.adapters)) {
    if (!isRecord(config)) throw new Error(`Invalid adapter config for ${adapterId}`);
    if (typeof config.command !== "string" || config.command.length === 0) {
      throw new Error(`Invalid adapter command for ${adapterId}`);
    }
    adapters[adapterId] = {
      command: config.command,
      args: asStringArray(config.args ?? [], `${adapterId}.args`),
    };
  }

  return {
    schemaVersion: "fitness-policy.v1",
    policyVersion: value.policyVersion,
    shadowMode: {
      enabled: Boolean(value.shadowMode.enabled),
      successfulRunsRemaining: Number(value.shadowMode.successfulRunsRemaining ?? 0),
    },
    execution: {
      timeoutMs: Number(value.execution.timeoutMs ?? 120_000),
      maxOutputBytes: Number(value.execution.maxOutputBytes ?? 1_048_576),
    },
    requiredCapabilities: asCapabilities(value.requiredCapabilities),
    hardRuleIds: asStringArray(value.hardRuleIds ?? [], "hardRuleIds"),
    shadowRuleIds: asStringArray(value.shadowRuleIds ?? [], "shadowRuleIds"),
    adapters,
  };
}

export async function loadFitnessPolicy(path: string): Promise<FitnessPolicy> {
  const raw = await readFile(path, "utf8");
  return parseFitnessPolicy(parseYaml(raw));
}

export function defaultFitnessPolicyPath(): string {
  const factoryRoot = process.env.FACTORY_REPO_ROOT ?? process.cwd();
  return join(factoryRoot, "factory/fitness/default.yaml");
}

export const maintainabilityDimensions = MAINTAINABILITY_DIMENSIONS;
