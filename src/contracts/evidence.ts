import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";

const SHA256 = Type.String({ pattern: "^[a-f0-9]{64}$" });

export const EvidenceKindSchema = Type.Union([
  Type.Literal("agent_output"), Type.Literal("tool_result"), Type.Literal("test"),
  Type.Literal("scenario"), Type.Literal("fitness"), Type.Literal("security"),
  Type.Literal("provenance"), Type.Literal("deployment"), Type.Literal("telemetry"),
  Type.Literal("incident"),
]);
export type EvidenceKind = Static<typeof EvidenceKindSchema>;

export const EvidenceRefSchema = Type.Object({
  schemaVersion: Type.Literal("evidence-ref.v1"),
  id: Type.String({ minLength: 1 }),
  sha256: SHA256,
  uri: Type.String({ minLength: 1 }),
}, { additionalProperties: false });
export type EvidenceRef = Readonly<Static<typeof EvidenceRefSchema>>;

const ProducerSchema = Type.Object({
  type: Type.String({ minLength: 1 }),
  id: Type.String({ minLength: 1 }),
  version: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const SubjectSchema = Type.Record(Type.String({ minLength: 1 }), Type.String());

export const EvidenceItemSchema = Type.Object({
  schemaVersion: Type.Literal("evidence.v1"),
  id: Type.String({ minLength: 1 }),
  kind: EvidenceKindSchema,
  mediaType: Type.String({ minLength: 1 }),
  sha256: SHA256,
  uri: Type.String({ minLength: 1 }),
  producer: ProducerSchema,
  subject: SubjectSchema,
  createdAt: Type.String({ format: "date-time" }),
  redaction: Type.Union([Type.Literal("none"), Type.Literal("secrets"), Type.Literal("pii")]),
}, { additionalProperties: false });
export type EvidenceItem = Readonly<Static<typeof EvidenceItemSchema>>;

function parse<T>(schema: TSchema, value: unknown): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid contract: ${error?.message || "schema mismatch"}`);
}

export function parseEvidenceRef(value: unknown): EvidenceRef {
  return parse<EvidenceRef>(EvidenceRefSchema, value);
}

export function parseEvidenceItem(value: unknown): EvidenceItem {
  return parse<EvidenceItem>(EvidenceItemSchema, value);
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}
