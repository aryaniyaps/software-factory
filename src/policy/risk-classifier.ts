import type { RiskTier } from "./work-policy.js";

export interface ClassificationInput {
  readonly title: string;
  readonly description: string;
  readonly workflow: string;
}

export interface RiskSignals {
  readonly auth: boolean;
  readonly migration: boolean;
  readonly destructive: boolean;
  readonly publicContract: boolean;
  readonly docsOnly: boolean;
}

export interface ClassificationResult {
  readonly riskTier: RiskTier;
  readonly signals: RiskSignals;
  readonly reasons: readonly string[];
}

const AUTH_PATTERN = /\b(auth|authentication|oauth|login|session|password|credential|jwt|sso)\b/i;
const MIGRATION_PATTERN = /\b(migration|migrate|schema change|alter table|add column)\b/i;
const DESTRUCTIVE_PATTERN = /\b(drop table|delete all|truncate|rm -rf|destructive|drop column|remove table)\b/i;
const PUBLIC_CONTRACT_PATTERN = /\b(public api|api contract|openapi|graphql schema|breaking change|public contract)\b/i;
const DOCS_PATTERN = /\b(documentation only|docs only|readme|no code changes)\b/i;

export function detectRiskSignals(input: ClassificationInput): RiskSignals {
  const text = `${input.title} ${input.description}`;
  const docsOnly = input.workflow === "docs"
    || input.workflow === "chore"
    || DOCS_PATTERN.test(text);

  return {
    auth: AUTH_PATTERN.test(text),
    migration: MIGRATION_PATTERN.test(text),
    destructive: DESTRUCTIVE_PATTERN.test(text),
    publicContract: PUBLIC_CONTRACT_PATTERN.test(text),
    docsOnly,
  };
}

export function classifyRisk(input: ClassificationInput): ClassificationResult {
  const signals = detectRiskSignals(input);
  const reasons: string[] = [];

  if (signals.docsOnly) {
    reasons.push("documentation_only");
    return { riskTier: "T0", signals, reasons };
  }

  if (signals.auth) {
    reasons.push("auth_surface_change");
    return { riskTier: "T3", signals, reasons };
  }

  if (signals.destructive) {
    reasons.push("destructive_change");
    return { riskTier: "T3", signals, reasons };
  }

  if (signals.migration && signals.destructive) {
    reasons.push("destructive_migration");
    return { riskTier: "T3", signals, reasons };
  }

  if (signals.migration) {
    reasons.push("schema_migration");
    return { riskTier: "T2", signals, reasons };
  }

  if (signals.publicContract) {
    reasons.push("public_contract_change");
    return { riskTier: "T2", signals, reasons };
  }

  reasons.push("contained_implementation");
  return { riskTier: "T1", signals, reasons };
}
