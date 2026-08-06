export interface CanaryStage {
  percentage: number;
  observationWindowMs: number;
}

export interface CanaryPolicy {
  policyVersion: string;
  stages: readonly CanaryStage[];
}

export const DEFAULT_CANARY_POLICY: CanaryPolicy = {
  policyVersion: "canary-policy.v1",
  stages: [
    { percentage: 10, observationWindowMs: 60_000 },
    { percentage: 50, observationWindowMs: 120_000 },
    { percentage: 100, observationWindowMs: 180_000 },
  ],
};

export function currentStage(policy: CanaryPolicy, stageIndex: number): CanaryStage {
  const stage = policy.stages[stageIndex];
  if (!stage) throw new Error(`canary stage ${stageIndex} is not defined`);
  return stage;
}

export function hasNextStage(policy: CanaryPolicy, stageIndex: number): boolean {
  return stageIndex + 1 < policy.stages.length;
}

export function nextStageIndex(stageIndex: number): number {
  return stageIndex + 1;
}
