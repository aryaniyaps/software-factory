import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Connection } from "@temporalio/client";
import { temporal } from "@temporalio/proto";

export const FACTORY_SEARCH_ATTRIBUTES = [
  ["FactoryRepository", "Keyword"],
  ["FactoryRunStatus", "Keyword"],
  ["FactoryCurrentNode", "Keyword"],
  ["FactoryWorkflowKind", "Keyword"],
  ["FactoryRiskTier", "Keyword"],
] as const;

const KEYWORD_TYPE = temporal.api.enums.v1.IndexedValueType.INDEXED_VALUE_TYPE_KEYWORD;

function isAlreadyRegistered(output: string): boolean {
  return /already exist/i.test(output);
}

export async function registerFactorySearchAttributesWithConnection(
  connection: Connection,
  namespace = process.env.TEMPORAL_NAMESPACE ?? "default",
): Promise<void> {
  try {
    await connection.operatorService.addSearchAttributes({
      namespace,
      searchAttributes: Object.fromEntries(
        FACTORY_SEARCH_ATTRIBUTES.map(([name]) => [name, KEYWORD_TYPE]),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAlreadyRegistered(message)) return;
    throw error;
  }
}

function temporalCliArgs(namespace: string): string[] {
  const args = [
    "operator",
    "search-attribute",
    "create",
    "--namespace",
    namespace,
    "--yes",
  ];
  for (const [name, type] of FACTORY_SEARCH_ATTRIBUTES) {
    args.push("--name", name, "--type", type);
  }
  return args;
}

function resolveTemporalCommand(): { command: string; prefixArgs: string[] } {
  const probe = spawnSync("temporal", ["--version"], { encoding: "utf8" });
  if (probe.error === undefined && probe.status === 0) {
    return { command: "temporal", prefixArgs: [] };
  }

  const composeFile = path.join(process.cwd(), "infra/compose/docker-compose.yml");
  const dockerProbe = spawnSync(
    "docker",
    ["compose", "-f", composeFile, "exec", "-T", "temporal", "temporal", "--version"],
    { encoding: "utf8" },
  );
  if (dockerProbe.error === undefined && dockerProbe.status === 0) {
    return {
      command: "docker",
      prefixArgs: ["compose", "-f", composeFile, "exec", "-T", "temporal", "temporal"],
    };
  }

  throw new Error(
    "temporal CLI not found in PATH and Temporal compose service is unavailable. "
    + "Install the Temporal CLI or run `npm run compose:up` first.",
  );
}

export async function ensureFactorySearchAttributes(
  namespace = process.env.TEMPORAL_NAMESPACE ?? "default",
): Promise<void> {
  const { command, prefixArgs } = resolveTemporalCommand();
  const args = [...prefixArgs, ...temporalCliArgs(namespace)];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      TEMPORAL_CLI_ADDRESS: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    },
  });

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.status === 0 || isAlreadyRegistered(output)) {
    console.log("Factory Temporal search attributes are registered");
    return;
  }

  throw new Error(output || `Failed to register Temporal search attributes (exit ${result.status ?? "unknown"})`);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  ensureFactorySearchAttributes()
    .catch((error: unknown) => {
      console.error("Temporal search attribute setup failed:", error);
      process.exitCode = 1;
    });
}
