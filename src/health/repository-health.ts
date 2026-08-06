import { classifyRisk } from "../policy/risk-classifier.js";
import { TIER_POLICIES, type RiskTier } from "../policy/work-policy.js";
import type { EvidenceRef } from "../contracts/evidence.js";
import type { Hotspot } from "./hotspots.js";

export const DEBT_REQUIREMENT_IDS = ["REQ-REPO-HEALTH", "REQ-DEBT-CLEANUP"] as const;
export const DEBT_ACCEPTANCE_IDS = ["AC-HOTSPOT-REDUCED", "AC-GATES-PASSED", "AC-PROBE-NO-REGRESSION"] as const;

export interface ReleaseRecord {
  readonly runId: string;
  readonly releasedAt: string;
  readonly artifactDigest: string;
}

export interface MaintenanceOutcome {
  readonly leadTimeMs: number;
  readonly attemptCount: number;
  readonly incidents: number;
  readonly reverts: number;
  readonly repeatFindings: readonly string[];
  readonly probeCostDelta?: number;
  readonly hotspotDelta?: number;
}

export interface ReleaseOutcomeJoin {
  readonly release: ReleaseRecord;
  readonly outcome: MaintenanceOutcome;
  readonly evidenceRefs: readonly string[];
}

export interface DebtWorkOrderScope {
  readonly files: readonly string[];
  readonly rationale: string;
}

export interface DebtWorkOrder {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly path: string;
  readonly requirements: readonly string[];
  readonly acceptance: readonly string[];
  readonly riskTier: RiskTier;
  readonly scope: DebtWorkOrderScope;
  readonly requiredGates: readonly string[];
  readonly evidenceRefs: readonly EvidenceRef[];
}

export interface GenerateDebtWorkOrdersInput {
  readonly hotspots: readonly Hotspot[];
  readonly joins: readonly ReleaseOutcomeJoin[];
  readonly sequence: number;
  readonly maxOrders?: number;
}

export interface RepositoryHealthLoopInput {
  readonly runId: string;
  readonly repositoryRoot: string;
  readonly churnEntries: readonly import("./hotspots.js").ChurnEntry[];
  readonly commitFileChanges: readonly import("./hotspots.js").CommitFileChanges[];
  readonly releases: readonly ReleaseRecord[];
  readonly outcomes: ReadonlyMap<string, MaintenanceOutcome>;
  readonly probeIds: readonly string[];
  readonly workOrderSequence: number;
}

export interface RepositoryHealthLoopResult {
  readonly hotspots: readonly Hotspot[];
  readonly coChangePairs: readonly import("./hotspots.js").CoChangePair[];
  readonly joins: readonly ReleaseOutcomeJoin[];
  readonly workOrders: readonly DebtWorkOrder[];
  readonly probeIds: readonly string[];
}

export function requiredCleanupGates(riskTier: RiskTier): readonly string[] {
  return [...TIER_POLICIES[riskTier].requiredGates];
}

export function joinReleaseOutcomes(
  releases: readonly ReleaseRecord[],
  outcomes: ReadonlyMap<string, MaintenanceOutcome>,
): ReleaseOutcomeJoin[] {
  return releases
    .filter((release) => outcomes.has(release.runId))
    .map((release) => {
      const outcome = outcomes.get(release.runId)!;
      return {
        release,
        outcome,
        evidenceRefs: [
          `release:${release.runId}`,
          `artifact:${release.artifactDigest}`,
          ...outcome.repeatFindings.map((finding) => `finding:${finding}`),
        ],
      };
    });
}

function repeatFindingCount(joins: readonly ReleaseOutcomeJoin[], file: string): number {
  const needle = file.toLowerCase();
  return joins.reduce((count, join) => {
    const repeats = join.outcome.repeatFindings.filter((finding) => finding.toLowerCase().includes(needle));
    return count + repeats.length;
  }, 0);
}

export function generateDebtWorkOrders(input: GenerateDebtWorkOrdersInput): DebtWorkOrder[] {
  const maxOrders = input.maxOrders ?? 3;
  const prioritized = [...input.hotspots]
    .map((hotspot) => ({
      hotspot,
      weight: hotspot.score + repeatFindingCount(input.joins, hotspot.file) * 10,
    }))
    .sort((left, right) => right.weight - left.weight || left.hotspot.file.localeCompare(right.hotspot.file))
    .slice(0, maxOrders);

  return prioritized.map(({ hotspot }, index) => {
    const sequence = input.sequence + index;
    const id = `WO-RH-${String(sequence).padStart(3, "0")}`;
    const classification = classifyRisk({
      title: `Reduce hotspot debt in ${hotspot.file}`,
      description: `Targeted cleanup for churn hotspot ${hotspot.file}`,
      workflow: "maintenance",
    });
    const requiredGates = requiredCleanupGates(classification.riskTier);

    return {
      id,
      version: 1,
      title: `Cleanup hotspot: ${hotspot.file}`,
      path: `factory/work-orders/${id.toLowerCase()}.md`,
      requirements: [...DEBT_REQUIREMENT_IDS],
      acceptance: [...DEBT_ACCEPTANCE_IDS],
      riskTier: classification.riskTier,
      scope: {
        files: [hotspot.file],
        rationale: `Hotspot rank ${hotspot.rank} with churn ${hotspot.churn}`,
      },
      requiredGates,
      evidenceRefs: [{
        schemaVersion: "evidence-ref.v1",
        id: `hotspot-${hotspot.file.replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
        sha256: "0".repeat(64),
        uri: `health://hotspot/${encodeURIComponent(hotspot.file)}`,
      }],
    };
  });
}

export function runRepositoryHealthLoop(
  input: RepositoryHealthLoopInput,
  deps: {
    readonly computeHotspots: typeof import("./hotspots.js").computeHotspots;
    readonly computeCoChangePairs: typeof import("./hotspots.js").computeCoChangePairs;
  },
): RepositoryHealthLoopResult {
  const hotspots = deps.computeHotspots(input.churnEntries);
  const coChangePairs = deps.computeCoChangePairs(input.commitFileChanges);
  const joins = joinReleaseOutcomes(input.releases, input.outcomes);

  const workOrders = generateDebtWorkOrders({
    hotspots,
    joins,
    sequence: input.workOrderSequence,
    maxOrders: 3,
  });

  return {
    hotspots,
    coChangePairs,
    joins,
    workOrders,
    probeIds: [...input.probeIds],
  };
}
