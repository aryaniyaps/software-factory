import { toolsForRole } from "../../agents/tool-policy.js";
import type { AgentRunner } from "../../agents/agent-node.js";
import { profileForRole } from "../../agents/role-profiles.js";
import type { FactoryActivities } from "./types.js";

export interface AgentMemoryHooks {
  buildContext(input: { run: unknown; role: string; value: unknown; mentalModels: readonly string[] }): Promise<string>;
  retainOutcome(input: { run: unknown; role: string; output: string }): Promise<void>;
}

export function createAgentActivities(dependencies: { run: AgentRunner["run"]; memory?: AgentMemoryHooks }): Pick<FactoryActivities, "runAgent"> {
  return {
    async runAgent(input) {
      const profile = profileForRole(input.role);
      const memoryContext = dependencies.memory ? await dependencies.memory.buildContext({ run: input.run, role: input.role, value: input.input, mentalModels: profile.mentalModels }) : "";
      const result = await dependencies.run({
        role: input.role,
        prompt: `Execute the ${input.role} phase and return the required JSON envelope.\nMemory context:\n${memoryContext}\nInput:\n${JSON.stringify(input.input)}`,
        cwd: input.worktree.path,
        tools: [...profile.tools],
        metadata: {
          factoryRunId: input.run.runId,
          ticketId: input.run.taskId,
          attemptId: input.run.attemptId ?? "1",
          phaseId: input.role,
          worktreeId: input.worktree.path,
        },
      });
      if (dependencies.memory) await dependencies.memory.retainOutcome({ run: input.run, role: input.role, output: result.text });
      return { sessionId: result.sessionId, output: result.text };
    },
  };
}
