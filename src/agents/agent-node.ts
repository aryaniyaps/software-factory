import type { NodeContext, WorkflowNode } from "../workflow/node.js";
import { toolsForRole } from "./tool-policy.js";

export interface AgentRunner {
  run(input: { role: string; prompt: string; cwd: string; tools: string[]; metadata: Record<string, string> }): Promise<{ text: string; sessionId: string }>;
}

export interface AgentNodeOutput {
  sessionId: string;
  envelope: {
    status: "success" | "fail";
    summary: string;
    artifacts: string[];
    notesForNextNode: string;
  };
}

function parseEnvelope(text: string): AgentNodeOutput["envelope"] {
  try {
    const value = JSON.parse(text) as Partial<AgentNodeOutput["envelope"]>;
    if ((value.status !== "success" && value.status !== "fail") || typeof value.summary !== "string" || !Array.isArray(value.artifacts) || typeof value.notesForNextNode !== "string") {
      throw new Error("shape");
    }
    return value as AgentNodeOutput["envelope"];
  } catch {
    throw new Error("invalid agent envelope");
  }
}

export function createAgentNode(runner: AgentRunner, role: string): WorkflowNode<unknown, AgentNodeOutput> {
  return {
    name: role,
    kind: "agent",
    run: async (input: object, context: NodeContext) => {
      const result = await runner.run({
        role,
        prompt: `Work as the ${role} phase. Return only the required JSON envelope.\nInput:\n${JSON.stringify(input)}`,
        cwd: context.worktreePath,
        tools: toolsForRole(role),
        metadata: {
          factoryRunId: context.runId,
          ticketId: context.ticketId,
          attemptId: context.attemptId,
          phaseId: role,
          worktreeId: context.worktreePath,
        },
      });
      return { sessionId: result.sessionId, envelope: parseEnvelope(result.text) };
    },
  };
}
