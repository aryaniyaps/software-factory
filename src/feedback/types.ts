import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { EvidenceRefSchema } from "../contracts/evidence.js";
import type { RiskTier } from "../policy/work-policy.js";

export const FEEDBACK_SOURCES = ["github", "incident", "webhook"] as const;
export const FeedbackSourceSchema = Type.Union([
  Type.Literal("github"),
  Type.Literal("incident"),
  Type.Literal("webhook"),
]);
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const INCIDENT_OUTCOMES = ["rollback", "resolved", "open"] as const;
export const IncidentOutcomeSchema = Type.Union([
  Type.Literal("rollback"),
  Type.Literal("resolved"),
  Type.Literal("open"),
]);
export type IncidentOutcome = (typeof INCIDENT_OUTCOMES)[number];

export const NormalizedFeedbackSchema = Type.Object({
  feedbackId: Type.String({ minLength: 1 }),
  source: FeedbackSourceSchema,
  externalId: Type.String({ minLength: 1 }),
  summary: Type.String({ minLength: 1 }),
  evidenceRefs: Type.Array(EvidenceRefSchema),
  incidentId: Type.Optional(Type.String({ minLength: 1 })),
  deploymentId: Type.Optional(Type.String({ minLength: 1 })),
  runId: Type.Optional(Type.String({ minLength: 1 })),
  artifactDigest: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });
export type NormalizedFeedback = Readonly<Static<typeof NormalizedFeedbackSchema>>;

export const FeedbackClusterSchema = Type.Object({
  clusterId: Type.String({ minLength: 1 }),
  theme: Type.String({ minLength: 1 }),
  memberFeedbackIds: Type.Array(Type.String({ minLength: 1 })),
  verbatimEvidenceRefs: Type.Array(EvidenceRefSchema),
}, { additionalProperties: false });
export type FeedbackCluster = Readonly<Static<typeof FeedbackClusterSchema>>;

export const FeedbackTraceabilitySchema = Type.Object({
  feedbackId: Type.String({ minLength: 1 }),
  incidentId: Type.String({ minLength: 1 }),
  deploymentId: Type.String({ minLength: 1 }),
  artifactDigest: Type.String({ minLength: 1 }),
  runId: Type.String({ minLength: 1 }),
  evidenceRefs: Type.Array(EvidenceRefSchema),
}, { additionalProperties: false });
export type FeedbackTraceability = Readonly<Static<typeof FeedbackTraceabilitySchema>>;

export const GeneratedWorkOrderSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  version: Type.Integer({ minimum: 1 }),
  title: Type.String({ minLength: 1 }),
  path: Type.String({ minLength: 1 }),
  requirements: Type.Array(Type.String({ minLength: 1 })),
  acceptance: Type.Array(Type.String({ minLength: 1 })),
  riskTier: Type.Union([
    Type.Literal("T0"), Type.Literal("T1"), Type.Literal("T2"), Type.Literal("T3"),
  ]),
  traceability: FeedbackTraceabilitySchema,
}, { additionalProperties: false });
export type GeneratedWorkOrder = Readonly<Static<typeof GeneratedWorkOrderSchema>>;

function parse<T>(schema: TSchema, value: unknown, label: string): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid ${label}: ${error?.message || "schema mismatch"}`);
}

export function parseNormalizedFeedback(value: unknown): NormalizedFeedback {
  return parse<NormalizedFeedback>(NormalizedFeedbackSchema, value, "normalized feedback");
}

export function parseFeedbackCluster(value: unknown): FeedbackCluster {
  return parse<FeedbackCluster>(FeedbackClusterSchema, value, "feedback cluster");
}

export function parseFeedbackTraceability(value: unknown): FeedbackTraceability {
  return parse<FeedbackTraceability>(FeedbackTraceabilitySchema, value, "feedback traceability");
}

export function parseGeneratedWorkOrder(value: unknown): GeneratedWorkOrder {
  return parse<GeneratedWorkOrder>(GeneratedWorkOrderSchema, value, "generated work order");
}

export function feedbackIdFor(source: FeedbackSource, externalId: string): string {
  return `${source}:${externalId}`;
}

export function buildDeploymentId(runId: string, artifactDigest: string): string {
  return `${runId}-${artifactDigest}`;
}

export function riskTierLabel(tier: RiskTier): string {
  return tier;
}
