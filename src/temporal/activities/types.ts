import type { FactoryWorkflowInput } from "../client.js";

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
  role: "scout" | "plan" | "implement" | "repair" | "review";
  input: unknown;
}

export interface AgentActivityResult {
  sessionId: string;
  output: unknown;
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

export interface BuildInput {
  run: FactoryWorkflowInput;
  worktree: WorktreeResult;
}

export interface ArtifactResult {
  image: string;
  digest: string;
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
  runAgent(input: AgentActivityInput): Promise<AgentActivityResult>;
  securityScan(input: SecurityScanInput): Promise<SecurityScanResult>;
  runChecks(input: ChecksInput): Promise<ChecksResult>;
  buildArtifact(input: BuildInput): Promise<ArtifactResult>;
  deploy(input: DeployInput): Promise<DeployResult>;
  healthCheck(input: HealthCheckInput): Promise<{ healthy: boolean; url: string }>;
  updateTaskStatus(input: TaskStatusInput): Promise<void>;
}

export declare function prepareRepository(input: FactoryWorkflowInput): Promise<RepositoryPreparation>;
export declare function createWorktree(input: WorktreeInput): Promise<WorktreeResult>;
export declare function runAgent(input: AgentActivityInput): Promise<AgentActivityResult>;
export declare function securityScan(input: SecurityScanInput): Promise<SecurityScanResult>;
export declare function runChecks(input: ChecksInput): Promise<ChecksResult>;
export declare function buildArtifact(input: BuildInput): Promise<ArtifactResult>;
export declare function deploy(input: DeployInput): Promise<DeployResult>;
export declare function healthCheck(input: HealthCheckInput): Promise<{ healthy: boolean; url: string }>;
export declare function updateTaskStatus(input: TaskStatusInput): Promise<void>;
