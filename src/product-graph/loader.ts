import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  hashProductGraph,
  parseProductGraph,
  type GraphNode,
  type GraphNodeKind,
  type ProductGraph,
  type ProductGraphSnapshot,
  type WorkOrder,
} from "../contracts/product-graph.js";

const MARKDOWN_DIRS = {
  requirements: "req",
  blueprints: "inv",
  acceptance: "ac",
} as const satisfies Record<string, GraphNodeKind>;

const YAML_DIRS = {
  scenarios: "scn",
  fitness: "fit",
  probes: "prb",
} as const satisfies Record<string, GraphNodeKind>;

const REF_FIELDS = [
  "requirements", "requirement", "blueprints", "blueprint", "acceptance",
  "scenarios", "scenario", "fitness", "probes", "refs",
] as const;

const TRACE_FIELDS = ["traces", "symbols", "tests", "telemetry"] as const;

export interface FactoryManifest {
  readonly schemaVersion: "factory.v1";
  readonly product: string;
  readonly version: string;
}

export async function loadFactoryManifest(factoryRoot: string): Promise<FactoryManifest> {
  const manifestPath = path.join(factoryRoot, "factory.yaml");
  const raw = parseYaml(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  if (raw.schemaVersion !== "factory.v1") {
    throw new Error(`Invalid factory manifest at ${manifestPath}: expected schemaVersion factory.v1`);
  }
  if (typeof raw.product !== "string" || typeof raw.version !== "string") {
    throw new Error(`Invalid factory manifest at ${manifestPath}: product and version are required`);
  }
  return { schemaVersion: "factory.v1", product: raw.product, version: raw.version };
}

export async function loadProductGraph(factoryRoot: string): Promise<ProductGraph> {
  const manifest = await loadFactoryManifest(factoryRoot);
  const nodes: GraphNode[] = [];

  for (const [dirName, kind] of Object.entries(MARKDOWN_DIRS)) {
    const dirPath = path.join(factoryRoot, dirName);
    if (!(await exists(dirPath))) continue;
    for (const fileName of await listFiles(dirPath, ".md")) {
      nodes.push(await loadMarkdownNode(path.join(dirPath, fileName), kind));
    }
  }

  for (const [dirName, kind] of Object.entries(YAML_DIRS)) {
    const dirPath = path.join(factoryRoot, dirName);
    if (!(await exists(dirPath))) continue;
    for (const fileName of await listFiles(dirPath, ".yaml", ".yml")) {
      nodes.push(await loadYamlNode(path.join(dirPath, fileName), kind));
    }
  }

  const graph = {
    schemaVersion: "product-graph.v1" as const,
    factoryRoot,
    factoryVersion: manifest.version,
    product: manifest.product,
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
  };
  return parseProductGraph(graph);
}

export async function loadWorkOrders(factoryRoot: string): Promise<WorkOrder[]> {
  const dirPath = path.join(factoryRoot, "work-orders");
  if (!(await exists(dirPath))) return [];

  const workOrders: WorkOrder[] = [];
  for (const fileName of await listFiles(dirPath, ".md")) {
    const filePath = path.join(dirPath, fileName);
    const { frontmatter } = splitMarkdown(await readFile(filePath, "utf8"));
    const id = requireString(frontmatter, "id", filePath);
    const version = requireNumber(frontmatter, "version", filePath);
    const title = requireString(frontmatter, "title", filePath);
    workOrders.push({
      id,
      version,
      title,
      path: filePath,
      requirements: readStringArray(frontmatter, "requirements"),
      acceptance: readStringArray(frontmatter, "acceptance"),
    });
  }

  return workOrders.sort((left, right) => left.id.localeCompare(right.id));
}

export function createRunSnapshot(
  graph: ProductGraph,
  workOrder: WorkOrder,
  options: { snapshotId?: string; capturedAt?: string } = {},
): ProductGraphSnapshot {
  const snapshot = {
    schemaVersion: "product-graph-snapshot.v1" as const,
    snapshotId: options.snapshotId ?? `snapshot-${workOrder.id}-v${workOrder.version}`,
    workOrderId: workOrder.id,
    workOrderVersion: workOrder.version,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    graphHash: hashProductGraph(graph),
    graph,
  };
  return snapshot;
}

async function loadMarkdownNode(filePath: string, kind: GraphNodeKind): Promise<GraphNode> {
  const { frontmatter } = splitMarkdown(await readFile(filePath, "utf8"));
  return buildNode(filePath, kind, frontmatter);
}

async function loadYamlNode(filePath: string, kind: GraphNodeKind): Promise<GraphNode> {
  const frontmatter = parseYaml(await readFile(filePath, "utf8")) as Record<string, unknown>;
  return buildNode(filePath, kind, frontmatter);
}

function buildNode(filePath: string, kind: GraphNodeKind, frontmatter: Record<string, unknown>): GraphNode {
  const id = requireString(frontmatter, "id", filePath);
  const title = requireString(frontmatter, "title", filePath);
  return {
    id,
    kind,
    title,
    path: filePath,
    refs: collectRefs(frontmatter),
    traces: collectTraces(frontmatter),
  };
}

function splitMarkdown(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(content);
  if (!match) throw new Error("Markdown contract must begin with YAML frontmatter");
  const frontmatter = parseYaml(match[1]);
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error("Markdown frontmatter must be a YAML mapping");
  }
  return { frontmatter: frontmatter as Record<string, unknown>, body: match[2] ?? "" };
}

function collectRefs(frontmatter: Record<string, unknown>): string[] {
  const refs = new Set<string>();
  for (const field of REF_FIELDS) {
    for (const value of readStringArray(frontmatter, field)) refs.add(value);
  }
  return [...refs].sort((left, right) => left.localeCompare(right));
}

function collectTraces(frontmatter: Record<string, unknown>): string[] {
  const traces = new Set<string>();
  for (const field of TRACE_FIELDS) {
    for (const value of readStringArray(frontmatter, field)) traces.add(value);
  }
  return [...traces].sort((left, right) => left.localeCompare(right));
}

function requireString(record: Record<string, unknown>, key: string, filePath: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string field '${key}' in ${filePath}`);
  }
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string, filePath: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Missing required positive integer field '${key}' in ${filePath}`);
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Field '${key}' must be an array of strings`);
  }
  return value;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dirPath: string, ...extensions: string[]): Promise<string[]> {
  const entries = await readdir(dirPath);
  return entries
    .filter((entry) => extensions.some((extension) => entry.endsWith(extension)))
    .sort((left, right) => left.localeCompare(right));
}
