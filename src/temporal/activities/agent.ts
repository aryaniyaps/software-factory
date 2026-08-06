import { toolsForRole } from "../../agents/tool-policy.js";
import { buildAgentPrompt } from "../../agents/prompts.js";
import type { AgentRunner } from "../../agents/runner.js";
import { profileForRole } from "../../agents/role-profiles.js";
import type { FactoryActivities } from "./types.js";
import { parseAgentOutput } from "../../contracts/nodes.js";

export interface AgentMemoryHooks {
  buildContext(input: { run: unknown; role: string; value: unknown; mentalModels: readonly string[]; operations: readonly ("recall" | "reflect" | "retain")[] }): Promise<string>;
  retainOutcome(input: { run: unknown; role: string; output: string; operations: readonly ("recall" | "reflect" | "retain")[] }): Promise<void>;
}

export function createAgentActivities(dependencies: { run: AgentRunner["run"]; memory?: AgentMemoryHooks }): Pick<FactoryActivities, "runAgent"> {
  return {
    async runAgent(input) {
      const profile = profileForRole(input.role);
      const mode = typeof input.input === "object" && input.input && "mode" in input.input
        ? String((input.input as { mode?: string }).mode)
        : undefined;
      const memoryContext = dependencies.memory
        ? await dependencies.memory.buildContext({
          run: input.run,
          role: input.role,
          value: input.input,
          mentalModels: profile.mentalModels,
          operations: profile.hindsightOperations,
        })
        : "";
      const result = await dependencies.run({
        role: input.role,
        prompt: buildAgentPrompt({ role: input.role, mode, memoryContext, payload: input.input }),
        cwd: input.worktree.path,
        tools: toolsForRole(input.role),
        metadata: {
          factoryRunId: input.run.runId,
          ticketId: input.run.taskId,
          attemptId: input.run.attemptId ?? "1",
          phaseId: input.role,
          worktreeId: input.worktree.path,
          ...(mode ? { mode } : {}),
        },
      });
      if (dependencies.memory && profile.hindsightOperations.includes("retain")) {
        await dependencies.memory.retainOutcome({
          run: input.run,
          role: input.role,
          output: result.text,
          operations: profile.hindsightOperations,
        });
      }
      return { sessionId: result.sessionId, output: parseAgentOutput(result.text) };
    },
  };
}
