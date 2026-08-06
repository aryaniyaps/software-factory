import { createHash } from "node:crypto";
import { stableSerialize } from "../contracts/evidence.js";
import type { RiskTier } from "../policy/work-policy.js";

export const CORPUS_OUTCOMES = [
  "success",
  "failed",
  "abstained",
  "incident",
  "maintenance",
] as const;

export type CorpusCaseOutcome = (typeof CORPUS_OUTCOMES)[number];

export interface CorpusCaseMetrics {
  readonly costTokens: number;
  readonly durationMs: number;
  readonly incidents: number;
  readonly maintainabilityDelta?: number;
  readonly variance?: number;
}

export interface CorpusCase {
  readonly id: string;
  readonly outcome: CorpusCaseOutcome;
  readonly role: string;
  readonly riskTier: RiskTier;
  readonly taskSummary: string;
  readonly metrics: CorpusCaseMetrics;
  readonly evidenceRefs: readonly string[];
  readonly recordedAt: string;
}

export interface CorpusVersion {
  readonly version: string;
  readonly createdAt: string;
  readonly cases: readonly CorpusCase[];
  readonly contentHash: string;
}

export interface CorpusRunRecord {
  readonly runId: string;
  readonly outcome: CorpusCaseOutcome;
  readonly role: string;
  readonly riskTier: RiskTier;
  readonly taskSummary: string;
  readonly metrics: CorpusCaseMetrics;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt?: string;
}

function hashCases(cases: readonly CorpusCase[]): string {
  return createHash("sha256").update(stableSerialize(cases)).digest("hex");
}

export function buildCorpusVersion(
  version: string,
  cases: readonly CorpusCase[],
  createdAt = new Date().toISOString(),
): CorpusVersion {
  const sortedForHash = [...cases].sort((left, right) => left.id.localeCompare(right.id));
  return {
    version,
    createdAt,
    cases: [...cases],
    contentHash: hashCases(sortedForHash),
  };
}

export function appendToCorpus(
  corpus: CorpusVersion,
  cases: readonly CorpusCase[],
): CorpusVersion {
  const merged = [...corpus.cases, ...cases];
  return buildCorpusVersion(corpus.version, merged, corpus.createdAt);
}

export function ingestRunIntoCorpus(
  corpus: CorpusVersion,
  record: CorpusRunRecord,
): CorpusVersion {
  return appendToCorpus(corpus, [{
    id: record.runId,
    outcome: record.outcome,
    role: record.role,
    riskTier: record.riskTier,
    taskSummary: record.taskSummary,
    metrics: record.metrics,
    evidenceRefs: record.evidenceRefs ?? [`run:${record.runId}`],
    recordedAt: record.recordedAt ?? new Date().toISOString(),
  }]);
}

export function buildCorpusFromRuns(
  version: string,
  records: readonly CorpusRunRecord[],
): CorpusVersion {
  const cases = records.map((record) => ({
    id: record.runId,
    outcome: record.outcome,
    role: record.role,
    riskTier: record.riskTier,
    taskSummary: record.taskSummary,
    metrics: record.metrics,
    evidenceRefs: record.evidenceRefs ?? [`run:${record.runId}`],
    recordedAt: record.recordedAt ?? new Date().toISOString(),
  }));
  return buildCorpusVersion(version, cases);
}
