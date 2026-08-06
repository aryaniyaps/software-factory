import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { createHash } from "node:crypto";
import { stableSerialize } from "./evidence.js";

export const GRAPH_NODE_KINDS = ["req", "inv", "ac", "scn", "fit", "prb"] as const;
export const GraphNodeKindSchema = Type.Union([
  Type.Literal("req"),
  Type.Literal("inv"),
  Type.Literal("ac"),
  Type.Literal("scn"),
  Type.Literal("fit"),
  Type.Literal("prb"),
]);
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export const STABLE_ID_PATTERNS: Readonly<Record<GraphNodeKind, RegExp>> = {
  req: /^REQ-[A-Z0-9][A-Z0-9-]*$/,
  inv: /^INV-[A-Z0-9][A-Z0-9-]*$/,
  ac: /^AC-[A-Z0-9][A-Z0-9-]*$/,
  scn: /^SCN-[A-Z0-9][A-Z0-9-]*$/,
  fit: /^FIT-[A-Z0-9][A-Z0-9-]*$/,
  prb: /^PRB-[A-Z0-9][A-Z0-9-]*$/,
};

export const GraphNodeSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  kind: GraphNodeKindSchema,
  title: Type.String({ minLength: 1 }),
  path: Type.String({ minLength: 1 }),
  refs: Type.Array(Type.String({ minLength: 1 })),
  traces: Type.Array(Type.String({ minLength: 1 })),
}, { additionalProperties: false });
export type GraphNode = Readonly<Static<typeof GraphNodeSchema>>;

export const ProductGraphSchema = Type.Object({
  schemaVersion: Type.Literal("product-graph.v1"),
  factoryRoot: Type.String({ minLength: 1 }),
  factoryVersion: Type.String({ minLength: 1 }),
  product: Type.String({ minLength: 1 }),
  nodes: Type.Array(GraphNodeSchema),
}, { additionalProperties: false });
export type ProductGraph = Readonly<Static<typeof ProductGraphSchema>>;

export const WorkOrderSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  version: Type.Integer({ minimum: 1 }),
  title: Type.String({ minLength: 1 }),
  path: Type.String({ minLength: 1 }),
  requirements: Type.Array(Type.String({ minLength: 1 })),
  acceptance: Type.Array(Type.String({ minLength: 1 })),
}, { additionalProperties: false });
export type WorkOrder = Readonly<Static<typeof WorkOrderSchema>>;

export const ProductGraphSnapshotSchema = Type.Object({
  schemaVersion: Type.Literal("product-graph-snapshot.v1"),
  snapshotId: Type.String({ minLength: 1 }),
  workOrderId: Type.String({ minLength: 1 }),
  workOrderVersion: Type.Integer({ minimum: 1 }),
  capturedAt: Type.String({ format: "date-time" }),
  graphHash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  graph: ProductGraphSchema,
}, { additionalProperties: false });
export type ProductGraphSnapshot = Readonly<Static<typeof ProductGraphSnapshotSchema>>;

export const VALIDATION_FINDING_CODES = [
  "duplicate_id", "dangling_ref", "invalid_id_format", "schema_invalid",
] as const;
export const ValidationFindingCodeSchema = Type.Union([
  Type.Literal("duplicate_id"),
  Type.Literal("dangling_ref"),
  Type.Literal("invalid_id_format"),
  Type.Literal("schema_invalid"),
]);
export type ValidationFindingCode = (typeof VALIDATION_FINDING_CODES)[number];

export const ValidationFindingSchema = Type.Object({
  code: ValidationFindingCodeSchema,
  message: Type.String({ minLength: 1 }),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  path: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });
export type ValidationFinding = Readonly<Static<typeof ValidationFindingSchema>>;

export const COVERAGE_FINDING_CODES = [
  "uncovered_acceptance", "untraced_change", "stale_blueprint_link", "missing_requirement_trace",
] as const;
export const CoverageFindingCodeSchema = Type.Union([
  Type.Literal("uncovered_acceptance"),
  Type.Literal("untraced_change"),
  Type.Literal("stale_blueprint_link"),
  Type.Literal("missing_requirement_trace"),
]);
export type CoverageFindingCode = (typeof COVERAGE_FINDING_CODES)[number];

export const CoverageFindingSchema = Type.Object({
  code: CoverageFindingCodeSchema,
  message: Type.String({ minLength: 1 }),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  path: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });
export type CoverageFinding = Readonly<Static<typeof CoverageFindingSchema>>;

export const ChangeTraceInputSchema = Type.Object({
  changedFiles: Type.Array(Type.String({ minLength: 1 })),
  changedSymbols: Type.Array(Type.String({ minLength: 1 })),
  changedTests: Type.Array(Type.String({ minLength: 1 })),
  telemetryKeys: Type.Array(Type.String({ minLength: 1 })),
  repairFinding: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });
export type ChangeTraceInput = Readonly<Static<typeof ChangeTraceInputSchema>>;

function parse<T>(schema: TSchema, value: unknown, label: string): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid ${label}: ${error?.message || "schema mismatch"}`);
}

export function parseGraphNode(value: unknown): GraphNode {
  return parse<GraphNode>(GraphNodeSchema, value, "graph node");
}

export function parseProductGraph(value: unknown): ProductGraph {
  return parse<ProductGraph>(ProductGraphSchema, value, "product graph");
}

export function parseWorkOrder(value: unknown): WorkOrder {
  return parse<WorkOrder>(WorkOrderSchema, value, "work order");
}

export function parseProductGraphSnapshot(value: unknown): ProductGraphSnapshot {
  return parse<ProductGraphSnapshot>(ProductGraphSnapshotSchema, value, "product graph snapshot");
}

export function graphNodeKindForId(id: string): GraphNodeKind | undefined {
  const prefix = id.split("-", 1)[0]?.toLowerCase();
  return GRAPH_NODE_KINDS.find((kind) => kind === prefix);
}

export function isStableGraphId(id: string): boolean {
  const kind = graphNodeKindForId(id);
  return kind !== undefined && STABLE_ID_PATTERNS[kind].test(id);
}

export function hashProductGraph(graph: ProductGraph): string {
  return createHash("sha256").update(stableSerialize(graph)).digest("hex");
}
