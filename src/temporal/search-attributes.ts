import path from "node:path";
import { pathToFileURL } from "node:url";
import { Connection } from "@temporalio/client";
import temporalProto from "@temporalio/proto";
import type { temporal as TemporalProto } from "@temporalio/proto";
import Long from "long";

const { temporal } = temporalProto;

export const FACTORY_RETENTION_DAYS = 90;

export const FACTORY_SEARCH_ATTRIBUTES = [
  ["FactoryRepository", "Keyword"],
  ["FactoryRunStatus", "Keyword"],
  ["FactoryCurrentNode", "Keyword"],
  ["FactoryWorkflowKind", "Keyword"],
  ["FactoryRiskTier", "Keyword"],
  ["FactoryExecutionContract", "Keyword"],
] as const;

const KEYWORD_TYPE = temporal.api.enums.v1.IndexedValueType.INDEXED_VALUE_TYPE_KEYWORD;

function isAlreadyRegistered(output: string): boolean {
  return /already exist/i.test(output);
}

export async function registerFactorySearchAttributesWithConnection(
  connection: Connection,
  namespace = process.env.TEMPORAL_NAMESPACE ?? "default",
): Promise<void> {
  let missing: readonly (typeof FACTORY_SEARCH_ATTRIBUTES)[number][] = FACTORY_SEARCH_ATTRIBUTES;
  try {
    const registered = await connection.operatorService.listSearchAttributes({ namespace });
    missing = FACTORY_SEARCH_ATTRIBUTES.filter(([name]) => !(name in registered.customAttributes));
  } catch (error) {
    if (!/unimplemented/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  if (missing.length === 0) return;
  try {
    await connection.operatorService.addSearchAttributes({
      namespace,
      searchAttributes: Object.fromEntries(missing.map(([name]) => [name, KEYWORD_TYPE])),
    });
  } catch (error) {
    if (!isAlreadyRegistered(error instanceof Error ? error.message : String(error))) throw error;
  }
}

export function namespacePolicyRequest(
  namespace: string,
): TemporalProto.api.workflowservice.v1.IUpdateNamespaceRequest {
  return {
    namespace,
    config: {
      workflowExecutionRetentionTtl: {
        seconds: Long.fromNumber(FACTORY_RETENTION_DAYS * 24 * 60 * 60),
      },
    },
  };
}

export async function enforceFactoryNamespacePolicyWithConnection(
  connection: Connection,
  namespace = process.env.TEMPORAL_NAMESPACE ?? "default",
): Promise<void> {
  await connection.workflowService.updateNamespace(namespacePolicyRequest(namespace));
}

export async function ensureFactorySearchAttributes(
  namespace = process.env.TEMPORAL_NAMESPACE ?? "default",
): Promise<void> {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  try {
    await registerFactorySearchAttributesWithConnection(connection, namespace);
    await enforceFactoryNamespacePolicyWithConnection(connection, namespace);
  } finally {
    await connection.close();
  }
  console.log(`Factory Temporal search attributes are registered; retention is ${FACTORY_RETENTION_DAYS} days`);
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
