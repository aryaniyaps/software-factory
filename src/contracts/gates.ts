import { Type, type Static } from "typebox";
import { Check, Errors } from "typebox/value";

export const DecisionSchema = Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("abstain")]);
export type Decision = Static<typeof DecisionSchema>;

export const GateReasonSchema = Type.Object({
  code: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
}, { additionalProperties: false });
export type GateReason = Readonly<Static<typeof GateReasonSchema>>;

export const GateDecisionSchema = Type.Object({
  schemaVersion: Type.Literal("gate.v1"),
  gateId: Type.String({ minLength: 1 }),
  decision: DecisionSchema,
  policyVersion: Type.String({ minLength: 1 }),
  reasons: Type.Array(GateReasonSchema),
  evidenceRefs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
}, { additionalProperties: false });
export type GateDecision = Readonly<Static<typeof GateDecisionSchema>>;

export function parseGateDecision(value: unknown): GateDecision {
  if (Check(GateDecisionSchema, value)) return value as GateDecision;
  const error = [...Errors(GateDecisionSchema, value)][0];
  throw new Error(`Invalid gate decision: ${error?.message || "schema mismatch"}`);
}
