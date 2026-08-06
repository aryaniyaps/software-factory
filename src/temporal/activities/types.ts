import type { FactoryWorkflowInput } from "../client.js";
import type { AgentInput, AgentOutput, AgentRole } from "../../contracts/nodes.js";

export interface RepositoryPreparation {
  repository: string;
  revision: string;
}

export interface WorktreeInput extends FactoryWorkflowInput {
  preparation: RepositoryPreparation;
}

export interface WorktreeResult {
  path: string;
  branch: string;
}

export interface AgentActivityInput {
  run: FactoryWorkflowInput;
  worktree: WorktreeResult;
  role: AgentRole;
  input: AgentInput;
}

export interface AgentActivityResult {
  sessionId: string;
  output: AgentOutput;
}

export interface ChecksInput {
  run: FactoryWorkflowInput;
  worktree: WorktreeResult;
}

export interface SecurityScanInput {
  run: FactoryWorkflowInput;
  worktree: WorktreeResult;
}

export interface SecurityScanResult {
  passed: boolean;
  findings: string[];
}

export interface HealthCheckInput {
  run: FactoryWorkflowInput;
  url: string;
  digest: string;
}

export interface ChecksResult {
  passed: boolean;
  output: string;
}

export interface FitnessAssessmentResult {
  outcome: "pass" | "policy_block" | "insufficient_evidence";
  policyVersion: string;
  shadowMode: boolean;
  findings: readonly import("../../assurance/fitness/types.js").FitnessFinding[];
  rawSubScores: readonly import("../../assurance/fitness/types.js").FitnessRawSubScore[];
  missingCapabilities: readonly import("../../assurance/fitness/types.js").FitnessCapability[];
}

export interface BuildInput {
  run: FactoryWorkflowInput;
  worktree: WorktreeResult;
}

export interface ArtifactResult {
  image: string;
  digest: string;
  sbomSha256?: string;
  provenanceSignature?: string;
}

export interface DeployInput {
  run: FactoryWorkflowInput;
  artifact: ArtifactResult;
}

export interface DeployResult {
  deployed: boolean;
  healthUrl: string;
}

export interface TaskStatusInput {
  taskId: string;
  status: string;
  runId: string;
}

export interface FactoryActivities {
  prepareRepository(input: FactoryWorkflowInput): Promise<RepositoryPreparation>;
  createWorktree(input: WorktreeInput): Promise<WorktreeResult>;
  removeWorktree(path: string): Promise<void>;
  runAgent(input: AgentActivityInput): Promise<AgentActivityResult>;
  securityScan(input: SecurityScanInput): Promise<SecurityScanResult>;
  runChecks(input: ChecksInput): Promise<ChecksResult>;
  runFitnessAssessment(input: ChecksInput): Promise<FitnessAssessmentResult>;
  runBehavioralVerification(input: import("./verifier.js").BehavioralVerifyInput): Promise<import("./verifier.js").BehavioralVerifyResult>;
  buildArtifact(input: BuildInput): Promise<ArtifactResult>;
  deploy(input: DeployInput): Promise<DeployResult>;
  healthCheck(input: HealthCheckInput): Promise<{ healthy: boolean; url: string }>;
  updateTaskStatus(input: TaskStatusInput): Promise<void>;
}

export declare function prepareRepository(input: FactoryWorkflowInput): Promise<RepositoryPreparation>;
export declare function createWorktree(input: WorktreeInput): Promise<WorktreeResult>;
export declare function removeWorktree(path: string): Promise<void>;
export declare function runAgent(input: AgentActivityInput): Promise<AgentActivityResult>;
export declare function securityScan(input: SecurityScanInput): Promise<SecurityScanResult>;
export declare function runChecks(input: ChecksInput): Promise<ChecksResult>;
export declare function runFitnessAssessment(input: ChecksInput): Promise<FitnessAssessmentResult>;
export declare function runBehavioralVerification(input: import("./verifier.js").BehavioralVerifyInput): Promise<import("./verifier.js").BehavioralVerifyResult>;
export declare function buildArtifact(input: BuildInput): Promise<ArtifactResult>;
export declare function deploy(input: DeployInput): Promise<DeployResult>;
export declare function healthCheck(input: HealthCheckInput): Promise<{ healthy: boolean; url: string }>;
export declare function updateTaskStatus(input: TaskStatusInput): Promise<void>;
