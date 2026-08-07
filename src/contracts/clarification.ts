import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";

const AddressSchema = Type.Object({
  type: Type.Union([
    Type.Literal("node"),
    Type.Literal("requester"),
    Type.Literal("human"),
    Type.Literal("a2a_agent"),
  ]),
  id: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const ClarificationRequestSchema = Type.Object({
  schemaVersion: Type.Literal("clarification-request.v1"),
  requestId: Type.String({ minLength: 1 }),
  runId: Type.String({ minLength: 1 }),
  threadId: Type.String({ minLength: 1 }),
  requestingNode: Type.String({ minLength: 1 }),
  recipient: AddressSchema,
  question: Type.String({ minLength: 1 }),
  responseSchema: Type.Optional(Type.Record(Type.String(), Type.Any())),
  stateRevision: Type.Integer({ minimum: 0 }),
  repositoryRevision: Type.Optional(Type.String({ minLength: 1 })),
  contextRefs: Type.Array(Type.String({ minLength: 1 })),
  createdAt: Type.String({ format: "date-time" }),
  deadlineAt: Type.String({ format: "date-time" }),
}, { additionalProperties: false });
export type ClarificationRequest = Readonly<Static<typeof ClarificationRequestSchema>>;

export const ClarificationAnswerSchema = Type.Object({
  schemaVersion: Type.Literal("clarification-answer.v1"),
  requestId: Type.String({ minLength: 1 }),
  answerId: Type.String({ minLength: 1 }),
  idempotencyKey: Type.String({ minLength: 1 }),
  responder: AddressSchema,
  body: Type.String({ minLength: 1 }),
  artifactRefs: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  stateRevision: Type.Integer({ minimum: 0 }),
  createdAt: Type.String({ format: "date-time" }),
}, { additionalProperties: false });
export type ClarificationAnswer = Readonly<Static<typeof ClarificationAnswerSchema>>;

function parse<T>(schema: TSchema, value: unknown): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid clarification contract: ${error?.message || "schema mismatch"}`);
}

export function parseClarificationRequest(value: unknown): ClarificationRequest {
  return parse<ClarificationRequest>(ClarificationRequestSchema, value);
}

export function parseClarificationAnswer(value: unknown): ClarificationAnswer {
  return parse<ClarificationAnswer>(ClarificationAnswerSchema, value);
}
