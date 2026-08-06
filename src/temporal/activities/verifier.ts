import type { FactoryWorkflowInput } from "../client.js";
import type { WorktreeResult } from "./types.js";
import type { ScenarioSuiteResult } from "../../scenarios/types.js";

export interface BehavioralVerifyInput {
  run: FactoryWorkflowInput;
  worktree: WorktreeResult;
  baselineRevision: string;
  acceptanceIds?: readonly string[];
}

export interface BehavioralVerifyResult {
  passed: boolean;
  decision: ScenarioSuiteResult["decision"];
  suite: ScenarioSuiteResult;
  evidenceRefs: readonly string[];
}

export interface VerifierActivities {
  runBehavioralVerification(input: BehavioralVerifyInput): Promise<BehavioralVerifyResult>;
}

export declare function runBehavioralVerification(input: BehavioralVerifyInput): Promise<BehavioralVerifyResult>;
