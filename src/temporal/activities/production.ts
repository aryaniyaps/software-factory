import type { AgentRunner } from "../../agents/agent-node.js";
import { toolsForRole } from "../../agents/tool-policy.js";
import type { WorkspaceProvider } from "../../workspaces/provider.js";
import type { FactoryActivities } from "./types.js";

export interface ProductionActivityDependencies {
  prepareRepository: FactoryActivities["prepareRepository"];
  createWorktree: FactoryActivities["createWorktree"];
  agentRunner: AgentRunner;
  workspace: WorkspaceProvider;
  buildArtifact: FactoryActivities["buildArtifact"];
  deploy: FactoryActivities["deploy"];
  updateTaskStatus: FactoryActivities["updateTaskStatus"];
}

export function createProductionActivities(dependencies: ProductionActivityDependencies): FactoryActivities {
  return {
    prepareRepository: dependencies.prepareRepository,
    createWorktree: dependencies.createWorktree,
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
      return { sessionId: result.sessionId, output: result.text };
    },
    runChecks: async (input) => {
      const workspace = await dependencies.workspace.create({ path: input.worktree.path, network: "restricted" });
      try {
        const result = await dependencies.workspace.exec(workspace.id, "npm", ["test", "--", "--run"], { cwd: "/workspace", timeoutMs: 30 * 60_000 });
        return { passed: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}` };
      } finally {
        await dependencies.workspace.destroy(workspace.id);
      }
    },
    buildArtifact: dependencies.buildArtifact,
    deploy: dependencies.deploy,
    updateTaskStatus: dependencies.updateTaskStatus,
  };
}
