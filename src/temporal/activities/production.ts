import type { AgentRunner } from "../../agents/agent-node.js";
import { toolsForRole } from "../../agents/tool-policy.js";
import type { WorkspaceProvider } from "../../workspaces/provider.js";
import { workspaceSpecForRole } from "../../security/capability-policy.js";
import { securityGate } from "../../gates/security-gate.js";
import type { FactoryActivities } from "./types.js";
import { parseAgentOutput } from "../../contracts/nodes.js";
import { createHealthActivities } from "./health.js";
import { createMetaFactoryActivities } from "./meta-factory.js";

export interface ProductionActivityDependencies {
  prepareRepository: FactoryActivities["prepareRepository"];
  createWorktree: FactoryActivities["createWorktree"];
  removeWorktree: FactoryActivities["removeWorktree"];
  agentRunner: AgentRunner;
  workspace: WorkspaceProvider;
  health: { wait(url: string, options?: { attempts?: number; intervalMs?: number }): Promise<void> };
  buildArtifact: FactoryActivities["buildArtifact"];
  deploy: FactoryActivities["deploy"];
  updateTaskStatus: FactoryActivities["updateTaskStatus"];
}

export function createProductionActivities(dependencies: ProductionActivityDependencies): FactoryActivities {
  const health = createHealthActivities();
  const metaFactory = createMetaFactoryActivities();
  return {
    prepareRepository: dependencies.prepareRepository,
    createWorktree: dependencies.createWorktree,
    removeWorktree: dependencies.removeWorktree,
    securityScan: async (input) => {
      const workspace = await dependencies.workspace.create(workspaceSpecForRole(input.worktree.path, "security_scan"));
      try {
        const result = await dependencies.workspace.exec(workspace.id, "git", ["ls-files"], { cwd: "/workspace" });
        if (result.exitCode !== 0) return { passed: false, findings: [result.stderr] };
        return securityGate({ files: result.stdout.split("\\n").filter(Boolean) });
      } finally {
        await dependencies.workspace.destroy(workspace.id);
      }
    },
    runAgent: async (input) => {
      const result = await dependencies.agentRunner.run({
        role: input.role,
        prompt: `Execute the ${input.role} phase and return a JSON envelope.\n${JSON.stringify(input.input)}`,
        cwd: input.worktree.path,
        tools: toolsForRole(input.role),
        metadata: {
          factoryRunId: input.run.runId,
          ticketId: input.run.taskId,
          attemptId: input.run.runId,
          phaseId: input.role,
          worktreeId: input.worktree.path,
        },
      });
      return { sessionId: result.sessionId, output: parseAgentOutput(result.text) };
    },
    runChecks: async (input) => {
      const workspace = await dependencies.workspace.create(workspaceSpecForRole(input.worktree.path, "implementer"));
      try {
        const result = await dependencies.workspace.exec(workspace.id, "npm", ["test", "--", "--run"], { cwd: "/workspace", timeoutMs: 30 * 60_000 });
        return { passed: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}` };
      } finally {
        await dependencies.workspace.destroy(workspace.id);
      }
    },
    runFitnessAssessment: async () => ({
      outcome: "pass",
      policyVersion: "test",
      shadowMode: true,
      findings: [],
      rawSubScores: [],
      missingCapabilities: [],
    }),
    buildArtifact: dependencies.buildArtifact,
    deploy: dependencies.deploy,
    getDeploymentTarget: async () => {
      throw new Error("release controller requires deploy worker");
    },
    deployPreview: async () => {
      throw new Error("release controller requires deploy worker");
    },
    deployCanary: async () => {
      throw new Error("release controller requires deploy worker");
    },
    verifyRelease: async () => {
      throw new Error("release controller requires deploy worker");
    },
    observeDeployment: async () => {
      throw new Error("release controller requires deploy worker");
    },
    rollbackDeployment: async () => {
      throw new Error("release controller requires deploy worker");
    },
    runBehavioralVerification: async () => {
      throw new Error("behavioral verification requires verifier worker");
    },
    healthCheck: async ({ url }) => {
      try {
        await dependencies.health.wait(url, { attempts: 3, intervalMs: 500 });
        return { healthy: true, url };
      } catch {
        return { healthy: false, url };
      }
    },
    updateTaskStatus: dependencies.updateTaskStatus,
    ...health,
    runMetaEvaluation: metaFactory.runMetaEvaluation,
  };
}
