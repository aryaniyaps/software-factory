import type { ObservationResult } from "./observation.js";

export interface RollbackTarget {
  deploymentId: string;
  candidateDigest: string;
  previousDigest: string;
}

export interface RollbackPlan {
  deploymentId: string;
  candidateDigest: string;
  targetDigest: string;
  idempotencyKey: string;
}

export interface RollbackFence {
  deploymentId: string;
  fencedAt: string;
}

export function shouldRollback(observation: ObservationResult): boolean {
  return observation.decision === "fail";
}

export function rollbackIdempotencyKey(target: RollbackTarget): string {
  return `rollback:${target.deploymentId}:${target.candidateDigest}->${target.previousDigest}`;
}

export function buildRollbackPlan(target: RollbackTarget): RollbackPlan {
  return {
    deploymentId: target.deploymentId,
    candidateDigest: target.candidateDigest,
    targetDigest: target.previousDigest,
    idempotencyKey: rollbackIdempotencyKey(target),
  };
}

export function createRollbackFence(deploymentId: string, now: string = new Date().toISOString()): RollbackFence {
  return { deploymentId, fencedAt: now };
}
