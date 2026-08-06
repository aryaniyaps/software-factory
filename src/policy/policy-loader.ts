import { createHash } from "node:crypto";
import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { stableSerialize } from "../contracts/evidence.js";
import { classifyRisk, type ClassificationInput, type ClassificationResult } from "./risk-classifier.js";
import {
  mergeWorkPolicy,
  POLICY_VERSION,
  tierPolicy,
  type RiskTier,
  type WorkPolicy,
} from "./work-policy.js";

export interface RepoPolicyOverrides {
  readonly policyVersion: string;
  readonly tokenBudget?: number;
  readonly maxAgentAttempts?: number;
  readonly maxRepairAttempts?: number;
  readonly wallClockBudgetMs?: number;
  readonly requiredGates?: readonly string[];
  readonly requiredCritics?: number;
  readonly requiredProbeCount?: number;
  readonly concurrency?: WorkPolicy["concurrency"];
}

export interface AssurancePlanInput extends ClassificationInput {
  readonly repository: string;
}

export interface ClassificationEvidence {
  readonly schemaVersion: "classification.v1";
  readonly policyVersion: string;
  readonly riskTier: RiskTier;
  readonly signals: ClassificationResult["signals"];
  readonly reasons: readonly string[];
  readonly assurancePlanHash: string;
  readonly classifiedAt: string;
}

export interface AssurancePlan {
  readonly policyVersion: string;
  readonly planHash: string;
  readonly classification: ClassificationResult;
  readonly workPolicy: WorkPolicy;
  readonly classificationEvidence: ClassificationEvidence;
}

export type ConcurrencyPhase = "run" | "implement" | "deploy" | "review";

export interface ConcurrencyKey {
  readonly repository: string;
  readonly phase: ConcurrencyPhase;
}

const RepoPolicyOverridesSchema = Type.Object({
  policyVersion: Type.String({ minLength: 1 }),
  tokenBudget: Type.Optional(Type.Integer({ minimum: 1 })),
  maxAgentAttempts: Type.Optional(Type.Integer({ minimum: 1 })),
  maxRepairAttempts: Type.Optional(Type.Integer({ minimum: 0 })),
  wallClockBudgetMs: Type.Optional(Type.Integer({ minimum: 1 })),
  requiredGates: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  requiredCritics: Type.Optional(Type.Integer({ minimum: 0 })),
  requiredProbeCount: Type.Optional(Type.Integer({ minimum: 0 })),
  concurrency: Type.Optional(Type.Object({
    maxConcurrentRunsPerRepo: Type.Integer({ minimum: 1 }),
    maxConcurrentPerPhase: Type.Record(Type.String({ minLength: 1 }), Type.Integer({ minimum: 1 })),
  }, { additionalProperties: false })),
}, { additionalProperties: false });

function parse<T>(schema: TSchema, value: unknown): T {
  if (Check(schema, value)) return value as T;
  const error = [...Errors(schema, value)][0];
  throw new Error(`Invalid policy override: ${error?.message || "schema mismatch"}`);
}

export function parseRepoPolicyOverrides(value: unknown): RepoPolicyOverrides {
  const overrides = parse<Static<typeof RepoPolicyOverridesSchema>>(RepoPolicyOverridesSchema, value);
  if (overrides.policyVersion !== POLICY_VERSION) {
    throw new Error(`Unsupported policy version: ${overrides.policyVersion}`);
  }
  if (overrides.requiredGates?.length === 0) {
    throw new Error("requiredGates cannot be emptied by override");
  }
  return overrides;
}

export function loadWorkPolicy(
  classification: ClassificationResult,
  overrides?: RepoPolicyOverrides,
): WorkPolicy {
  const base = tierPolicy(classification.riskTier);
  if (!overrides) return base;

  return mergeWorkPolicy(base, {
    tokenBudget: overrides.tokenBudget,
    maxAgentAttempts: overrides.maxAgentAttempts,
    maxRepairAttempts: overrides.maxRepairAttempts,
    wallClockBudgetMs: overrides.wallClockBudgetMs,
    requiredGates: overrides.requiredGates,
    requiredCritics: overrides.requiredCritics,
    requiredProbeCount: overrides.requiredProbeCount,
    concurrency: overrides.concurrency,
  });
}

export function buildAssurancePlan(input: AssurancePlanInput, overrides?: RepoPolicyOverrides): AssurancePlan {
  const classification = classifyRisk(input);
  const workPolicy = loadWorkPolicy(classification, overrides);
  const classifiedAt = "1970-01-01T00:00:00.000Z";

  const partial = {
    policyVersion: POLICY_VERSION,
    classification,
    workPolicy,
    repository: input.repository,
  };

  const planHash = createHash("sha256").update(stableSerialize({
    policyVersion: partial.policyVersion,
    classification: partial.classification,
    workPolicy: partial.workPolicy,
    repository: input.repository,
  })).digest("hex");

  const classificationEvidence: ClassificationEvidence = {
    schemaVersion: "classification.v1",
    policyVersion: POLICY_VERSION,
    riskTier: classification.riskTier,
    signals: classification.signals,
    reasons: classification.reasons,
    assurancePlanHash: planHash,
    classifiedAt,
  };

  return {
    policyVersion: POLICY_VERSION,
    planHash,
    classification,
    workPolicy,
    classificationEvidence,
  };
}

export class RepositoryConcurrencyRegistry {
  private readonly active = new Map<string, number>();

  private keyFor(concurrencyKey: ConcurrencyKey): string {
    return `${concurrencyKey.repository}:${concurrencyKey.phase}`;
  }

  tryAcquire(concurrencyKey: ConcurrencyKey, limit: number): boolean {
    const key = this.keyFor(concurrencyKey);
    const current = this.active.get(key) ?? 0;
    if (current >= limit) return false;
    this.active.set(key, current + 1);
    return true;
  }

  release(concurrencyKey: ConcurrencyKey): void {
    const key = this.keyFor(concurrencyKey);
    const current = this.active.get(key) ?? 0;
    if (current <= 1) {
      this.active.delete(key);
      return;
    }
    this.active.set(key, current - 1);
  }

  activeCount(concurrencyKey: ConcurrencyKey): number {
    return this.active.get(this.keyFor(concurrencyKey)) ?? 0;
  }
}
