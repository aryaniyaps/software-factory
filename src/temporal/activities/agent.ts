import { compactError } from "../../agents/compact-error.js";
import { buildContextPacket } from "../../agents/context-packet.js";
import { promptForRole } from "../../agents/prompts.js";
import type { AgentRunner } from "../../agents/runner.js";
import type { AgentToolCallRecord } from "../../agents/runner.js";
import { profileForRole } from "../../agents/role-profiles.js";
import { toolsForRole } from "../../agents/tool-policy.js";
import { correlationToAgentMetadata } from "../../integrations/correlation.js";
import type { FactoryActivities } from "./types.js";
import { parseAgentOutput, type AgentOutput } from "../../contracts/nodes.js";
import { parseNodeContext } from "../../contracts/conversation.js";

export interface AgentMemoryHooks {
  buildContext(input: { run: unknown; role: string; value: unknown; mentalModels: readonly string[]; operations: readonly ("recall" | "reflect" | "retain")[] }): Promise<string>;
  retainOutcome(input: { run: unknown; role: string; output: string; operations: readonly ("recall" | "reflect" | "retain")[] }): Promise<void>;
}

export interface AgentSessionHooks {
  recordTurn(input: {
    runId: string;
    sessionId: string;
    role: string;
    nodeAttemptId: string;
    turnId: string;
    turnIndex: number;
    prompt: string;
    systemPrompt: string;
    output: string;
    startedAt: string;
    completedAt: string;
    toolCalls: readonly AgentToolCallRecord[];
  }): Promise<void>;
}

function predecessorOutputs(value: unknown): AgentOutput[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const predecessors: AgentOutput[] = [];
  if (Array.isArray(record.predecessors)) {
    for (const item of record.predecessors) {
      if (isAgentOutput(item)) predecessors.push(item);
    }
  }
  if (record.previous && typeof record.previous === "object") {
    const previous = record.previous as Record<string, unknown>;
    if (isAgentOutput(previous)) predecessors.push(previous);
    for (const key of ["scout", "plan", "implement", "repair", "review"]) {
      if (isAgentOutput(previous[key])) predecessors.push(previous[key] as AgentOutput);
    }
  }
  return predecessors.length ? predecessors : undefined;
}

function evidenceRefsFromInput(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const refs = new Set<string>();
  collectEvidenceRefs(value, refs);
  return refs.size ? [...refs] : undefined;
}

function compactedErrorsFromInput(value: unknown): ReturnType<typeof compactError>[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const errors = [];
  if (record.checkFailure) errors.push(compactError(record.checkFailure));
  if (record.failure) errors.push(compactError(record.failure));
  if (Array.isArray(record.errors)) {
    for (const entry of record.errors) errors.push(compactError(entry));
  }
  return errors.length ? errors : undefined;
}

export function createAgentActivities(dependencies: {
  run: AgentRunner["run"];
  memory?: AgentMemoryHooks;
  sessions?: AgentSessionHooks;
}): Pick<FactoryActivities, "runAgent"> {
  return {
    async runAgent(input) {
      if (
        input.input
        && typeof input.input === "object"
        && (input.input as { schemaVersion?: unknown }).schemaVersion === "node-context.v1"
      ) {
        parseNodeContext(input.input);
      }
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
      const metadata = {
          ...correlationToAgentMetadata({
            factoryRunId: input.run.runId,
            ticketId: input.run.taskId,
            attemptId: input.run.attemptId ?? "1",
            phaseId: input.role,
            agentRole: input.role,
            worktreeId: input.worktree.path,
            organization: input.run.organization,
            project: input.run.project,
            repository: input.run.repository,
          }),
          ...(mode ? { mode } : {}),
        };
      const prompt = `${buildContextPacket({
        role: input.role,
        mode,
        memoryContext,
        payload: input.input,
        predecessors: predecessorOutputs(input.input),
        evidenceRefs: evidenceRefsFromInput(input.input),
        errors: compactedErrorsFromInput(input.input),
      })}\n\n<correlation>${JSON.stringify(metadata)}</correlation>`;
      const systemPrompt = promptForRole(input.role, mode, input.worktree.path);
      const startedAt = new Date().toISOString();
      const result = await dependencies.run({
        role: input.role,
        prompt,
        systemPrompt,
        cwd: input.worktree.path,
        tools: toolsForRole(input.role),
        metadata,
      });
      const completedAt = new Date().toISOString();
      if (dependencies.sessions) {
        const nodeAttemptId = input.run.attemptId ?? `${input.role}:1`;
        await dependencies.sessions.recordTurn({
          runId: input.run.runId,
          sessionId: result.sessionId,
          role: input.role,
          nodeAttemptId,
          turnId: "turn-0",
          turnIndex: 0,
          prompt,
          systemPrompt,
          output: result.text,
          startedAt,
          completedAt,
          toolCalls: result.toolCalls ?? [],
        });
      }
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

function isAgentOutput(value: unknown): value is AgentOutput {
  return typeof value === "object" && value !== null
    && (value as AgentOutput).schemaVersion === "agent-output.v1"
    && typeof (value as AgentOutput).role === "string";
}

function collectEvidenceRefs(value: unknown, refs: Set<string>, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === "string" && (value.startsWith("ev-") || value.startsWith("ev:"))) {
    refs.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceRefs(item, refs, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key.toLowerCase().includes("evidence")) collectEvidenceRefs(child, refs, depth + 1);
      else if (key.endsWith("Refs")) collectEvidenceRefs(child, refs, depth + 1);
    }
  }
}
