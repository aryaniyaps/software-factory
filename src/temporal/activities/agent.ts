import { toolsForRole } from "../../agents/tool-policy.js";
import type { AgentRunner } from "../../agents/agent-node.js";
import type { FactoryActivities } from "./types.js";

export function createAgentActivities(dependencies: { run: AgentRunner["run"] }): Pick<FactoryActivities, "runAgent"> {
  return {
    async runAgent(input) {
      const result = await dependencies.run({
        role: input.role,
        prompt: `Execute the ${input.role} phase and return the required JSON envelope.\n${JSON.stringify(input.input)}`,
        cwd: input.worktree.path,
        tools: toolsForRole(input.role),
        metadata: {
          factoryRunId: input.run.runId,
          ticketId: input.run.taskId,
          attemptId: input.run.attemptId ?? "1",
          phaseId: input.role,
          worktreeId: input.worktree.path,
        },
      });
      return { sessionId: result.sessionId, output: result.text };
    },
  };
}
