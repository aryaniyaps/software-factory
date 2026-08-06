import { access } from "node:fs/promises";
import { join } from "node:path";
import { computeDistribution } from "./comparator.js";
import {
  parseProbeDefinition,
  type ProbeDefinition,
  type ProbeValidationResult,
} from "./types.js";

export interface ProbeHiddenTestResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProbeValidationContext {
  readonly baselineRoot: string;
  readonly candidateRoot: string;
  readonly candidateDiffSummary: string;
  readonly hiddenTest: (root: string, probe: ProbeDefinition) => Promise<ProbeHiddenTestResult>;
}

const IMPLEMENTATION_LEAK_PATTERNS = [
  /\bCandidateSecretService\b/i,
  /\binternal\/candidate\b/i,
  /\bcandidate-only\b/i,
];

export function validateProbeDefinition(value: unknown): ProbeDefinition {
  return parseProbeDefinition(value);
}

async function markerExists(root: string, marker: string): Promise<boolean> {
  try {
    await access(join(root, marker));
    return true;
  } catch {
    return false;
  }
}

export function detectProbeLeak(
  probe: ProbeDefinition,
  candidateDiffSummary: string,
): ProbeValidationResult | undefined {
  const haystack = `${probe.requirement}\n${candidateDiffSummary}`;
  for (const pattern of IMPLEMENTATION_LEAK_PATTERNS) {
    if (pattern.test(haystack)) {
      return {
        status: "leaked",
        mergeable: false,
        reason: "probe requirement references candidate-specific implementation details",
      };
    }
  }
  return undefined;
}

export async function detectUnequalDifficulty(
  probe: ProbeDefinition,
  baselineRoot: string,
  candidateRoot: string,
): Promise<ProbeValidationResult | undefined> {
  const baselineMarkers = await Promise.all(
    probe.startingMarkers.baseline.map((marker) => markerExists(baselineRoot, marker)),
  );
  const candidateMarkers = await Promise.all(
    probe.startingMarkers.candidate.map((marker) => markerExists(candidateRoot, marker)),
  );
  if (!baselineMarkers.every(Boolean) || !candidateMarkers.every(Boolean)) {
    return {
      status: "unequal_difficulty",
      mergeable: false,
      reason: "required starting markers are missing on one revision",
    };
  }
  const baselineOnly = probe.startingMarkers.baseline.filter(
    (marker) => !probe.startingMarkers.candidate.includes(marker),
  );
  const candidateOnly = probe.startingMarkers.candidate.filter(
    (marker) => !probe.startingMarkers.baseline.includes(marker),
  );
  const baselineExclusive = await Promise.all(
    baselineOnly.map((marker) => markerExists(baselineRoot, marker)),
  );
  const candidateExclusive = await Promise.all(
    candidateOnly.map((marker) => markerExists(candidateRoot, marker)),
  );
  if (baselineExclusive.some(Boolean) !== candidateExclusive.some(Boolean)) {
    return {
      status: "unequal_difficulty",
      mergeable: false,
      reason: "baseline and candidate starting difficulty differ",
    };
  }
  return undefined;
}

export async function detectAlreadyImplemented(
  probe: ProbeDefinition,
  context: ProbeValidationContext,
): Promise<ProbeValidationResult | undefined> {
  const baseline = await context.hiddenTest(context.baselineRoot, probe);
  const candidate = await context.hiddenTest(context.candidateRoot, probe);
  if (baseline.exitCode === 0 && candidate.exitCode === 0) {
    return {
      status: "already_implemented",
      mergeable: false,
      reason: "hidden behavioral test already passes on both revisions",
    };
  }
  return undefined;
}

export function detectNoisyProbe(
  probe: ProbeDefinition,
  baselineRepeats: readonly number[],
  candidateRepeats: readonly number[],
): ProbeValidationResult | undefined {
  const maxVariance = probe.maxVariance ?? 0.05;
  const baseline = computeDistribution(baselineRepeats);
  const candidate = computeDistribution(candidateRepeats);
  if (baseline.variance > maxVariance || candidate.variance > maxVariance) {
    return {
      status: "noisy",
      mergeable: false,
      reason: "probe pre-check variance exceeds configured threshold",
    };
  }
  return undefined;
}

export async function validateProbe(
  probe: ProbeDefinition,
  context: ProbeValidationContext,
): Promise<ProbeValidationResult> {
  try {
    validateProbeDefinition(probe);
  } catch (error) {
    return {
      status: "invalid",
      mergeable: false,
      reason: String(error),
    };
  }

  const leaked = detectProbeLeak(probe, context.candidateDiffSummary);
  if (leaked) return leaked;

  const unequal = await detectUnequalDifficulty(probe, context.baselineRoot, context.candidateRoot);
  if (unequal) return unequal;

  const alreadyImplemented = await detectAlreadyImplemented(probe, context);
  if (alreadyImplemented) return alreadyImplemented;

  return { status: "valid", mergeable: false };
}
