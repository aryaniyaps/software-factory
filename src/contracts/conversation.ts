import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { AgentOutputSchema } from "./nodes.js";

const Sha256Schema = Type.String({ pattern: "^[a-f0-9]{64}$" });
const AddressSchema = Type.Object({
  type: Type.Union([
    Type.Literal("node"),
    Type.Literal("requester"),
    Type.Literal("human"),
    Type.Literal("a2a_agent"),
  ]),
  id: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const ArtifactRefSchema = Type.Object({
  schemaVersion: Type.Literal("artifact-ref.v1"),
  id: Type.String({ minLength: 1 }),
  kind: Type.String({ minLength: 1 }),
  mediaType: Type.String({ minLength: 1 }),
  uri: Type.String({ minLength: 1 }),
  sha256: Sha256Schema,
  producer: Type.Object({
    node: Type.String({ minLength: 1 }),
    attemptId: Type.String({ minLength: 1 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });
export type ArtifactRef = Readonly<Static<typeof ArtifactRefSchema>>;

export const ConversationMessageSchema = Type.Object({
  schemaVersion: Type.Literal("conversation-message.v1"),
  messageId: Type.String({ minLength: 1 }),
  threadId: Type.String({ minLength: 1 }),
  sequence: Type.Integer({ minimum: 0 }),
  kind: Type.Union([
    Type.Literal("question"),
    Type.Literal("answer"),
    Type.Literal("challenge"),
    Type.Literal("proposal"),
    Type.Literal("decision"),
    Type.Literal("retraction"),
  ]),
  sender: AddressSchema,
  recipients: Type.Array(AddressSchema, { minItems: 1 }),
  body: Type.String({ minLength: 1 }),
  replyTo: Type.Optional(Type.String({ minLength: 1 })),
  requestId: Type.Optional(Type.String({ minLength: 1 })),
  causationId: Type.Optional(Type.String({ minLength: 1 })),
  stateRevision: Type.Integer({ minimum: 0 }),
  repositoryRevision: Type.Optional(Type.String({ minLength: 1 })),
  artifactRefs: Type.Array(Type.Union([ArtifactRefSchema, Type.String({ minLength: 1 })])),
  createdAt: Type.String({ format: "date-time" }),
}, { additionalProperties: false });
export type ConversationMessage = Readonly<Static<typeof ConversationMessageSchema>>;

const ClaimRefSchema = Type.Object({
  claimId: Type.String({ minLength: 1 }),
  revision: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });

export const ClaimRevisionSchema = Type.Object({
  schemaVersion: Type.Literal("claim-revision.v1"),
  claimId: Type.String({ minLength: 1 }),
  revision: Type.Integer({ minimum: 1 }),
  status: Type.Union([
    Type.Literal("proposed"),
    Type.Literal("accepted"),
    Type.Literal("disputed"),
    Type.Literal("invalidated"),
    Type.Literal("superseded"),
  ]),
  author: AddressSchema,
  valueRef: ArtifactRefSchema,
  dependsOn: Type.Array(ClaimRefSchema),
  supersedes: Type.Optional(ClaimRefSchema),
  createdAt: Type.String({ format: "date-time" }),
}, { additionalProperties: false });
export type ClaimRevision = Readonly<Static<typeof ClaimRevisionSchema>>;

const TaskContextSchema = Type.Object({
  prompt: Type.String({ minLength: 1 }),
  title: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String({ minLength: 1 })),
  repository: Type.Optional(Type.String({ minLength: 1 })),
  baseBranch: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

const PredecessorRefSchema = Type.Object({
  node: Type.String({ minLength: 1 }),
  attemptId: Type.String({ minLength: 1 }),
  outputRef: ArtifactRefSchema,
  evidenceRefs: Type.Array(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

export const NodeContextSchema = Type.Object({
  schemaVersion: Type.Literal("node-context.v1"),
  stateRevision: Type.Integer({ minimum: 0 }),
  task: TaskContextSchema,
  repository: Type.Optional(Type.Object({
    revision: Type.String({ minLength: 1 }),
    worktreePath: Type.Optional(Type.String({ minLength: 1 })),
  }, { additionalProperties: false })),
  predecessors: Type.Array(Type.Union([PredecessorRefSchema, AgentOutputSchema])),
  conversationRefs: Type.Array(Type.Object({
    threadId: Type.String({ minLength: 1 }),
    throughSequence: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false })),
  claimRefs: Type.Array(ClaimRefSchema),
  clarification: Type.Optional(Type.Object({
    request: Type.Any(),
    answer: Type.Any(),
  }, { additionalProperties: false })),
  clarificationRequest: Type.Optional(Type.Any()),
}, { additionalProperties: false });
export type NodeContext = Readonly<Static<typeof NodeContextSchema>>;

function parse<T>(schema: TSchema, value: unknown): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid conversation contract: ${error?.message || "schema mismatch"}`);
}

export function parseConversationMessage(value: unknown): ConversationMessage {
  return parse<ConversationMessage>(ConversationMessageSchema, value);
}

export function parseClaimRevision(value: unknown): ClaimRevision {
  return parse<ClaimRevision>(ClaimRevisionSchema, value);
}

export function parseNodeContext(value: unknown): NodeContext {
  return parse<NodeContext>(NodeContextSchema, value);
}
