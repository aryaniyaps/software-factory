import { Type, type Static } from "typebox";
import { Check, Errors } from "typebox/value";

export const FailureTypeSchema = Type.Union([
  Type.Literal("transient"), Type.Literal("tool"), Type.Literal("policy"),
  Type.Literal("security"), Type.Literal("invalid_input"), Type.Literal("budget"),
  Type.Literal("unknown"),
]);
export type FailureType = Static<typeof FailureTypeSchema>;

export const FailureEnvelopeSchema = Type.Object({
  schemaVersion: Type.Literal("failure.v1"),
  type: FailureTypeSchema,
  code: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
  retryable: Type.Boolean(),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 })),
}, { additionalProperties: false });
export type FailureEnvelope = Readonly<Static<typeof FailureEnvelopeSchema>>;

export function parseFailureEnvelope(value: unknown): FailureEnvelope {
  if (Check(FailureEnvelopeSchema, value)) return value as FailureEnvelope;
  const error = [...Errors(FailureEnvelopeSchema, value)][0];
  throw new Error(`Invalid failure envelope: ${error?.message || "schema mismatch"}`);
}
