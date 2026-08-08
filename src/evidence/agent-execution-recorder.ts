import type { AgentToolCallRecord } from "../agents/runner.js";
import type {
  AgentTurnRecord,
  ExecutionObjectRef,
  ToolCallRecord,
} from "../contracts/execution.js";
import type { ObjectStore } from "./object-store.js";
import { sha256Hex } from "./object-store.js";

export interface AgentTurnInput {
  readonly runId: string;
  readonly sessionId: string;
  readonly role: string;
  readonly nodeAttemptId: string;
  readonly turnId: string;
  readonly turnIndex: number;
  readonly prompt: string;
  readonly systemPrompt: string;
  readonly output: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly toolCalls: readonly AgentToolCallRecord[];
}

export interface AgentExecutionRecords {
  readonly turn: AgentTurnRecord;
  readonly toolCalls: readonly ToolCallRecord[];
}

export interface AgentExecutionRecorder {
  recordTurn(input: AgentTurnInput): Promise<AgentExecutionRecords>;
}

export function createAgentExecutionRecorder(objectStore: ObjectStore): AgentExecutionRecorder {
  return {
    async recordTurn(input) {
      const transcript = redactedJson({
        schemaVersion: "agent-transcript.v2",
        role: input.role,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        output: input.output,
      });
      const transcriptRef = await putObject(
        objectStore,
        objectPath(input, "transcript", transcript),
        transcript,
      );

      const toolCalls = await Promise.all(input.toolCalls.map(async (call): Promise<ToolCallRecord> => {
        const inputBody = redactedJson(call.input);
        const outputBody = redactedJson(call.output);
        const callRoot = [
          input.runId,
          "agent-sessions",
          encodeURIComponent(input.sessionId),
          "tool-calls",
          encodeURIComponent(input.turnId),
          encodeURIComponent(call.callId),
        ].join("/");
        const inputRef = await putObject(
          objectStore,
          `${callRoot}.${sha256Hex(inputBody)}.input.json`,
          inputBody,
        );
        const outputRef = await putObject(
          objectStore,
          `${callRoot}.${sha256Hex(outputBody)}.output.json`,
          outputBody,
        );
        return {
          schemaVersion: "tool-call.v2",
          recordId: `tool:${input.nodeAttemptId}:${input.sessionId}:${input.turnId}:${call.callId}`,
          attemptId: input.nodeAttemptId,
          sessionId: input.sessionId,
          turnId: input.turnId,
          callId: call.callId,
          toolName: call.toolName,
          status: call.status,
          input: inputRef,
          output: outputRef,
          startedAt: call.startedAt,
          completedAt: call.completedAt,
        };
      }));

      return {
        turn: {
          schemaVersion: "agent-turn.v2",
          recordId: `turn:${input.nodeAttemptId}:${input.sessionId}:${input.turnId}`,
          attemptId: input.nodeAttemptId,
          sessionId: input.sessionId,
          turnId: input.turnId,
          turnIndex: input.turnIndex,
          role: input.role,
          transcript: transcriptRef,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
        },
        toolCalls,
      };
    },
  };
}

async function putObject(
  objectStore: ObjectStore,
  objectId: string,
  body: string,
): Promise<ExecutionObjectRef> {
  const stored = await objectStore.put(objectId, body);
  await objectStore.verify(objectId, stored.sha256);
  return {
    objectId,
    sha256: stored.sha256,
    uri: stored.uri,
    redaction: "secrets",
    mediaType: "application/json",
  };
}

function objectPath(input: AgentTurnInput, kind: string, body: string): string {
  return [
    input.runId,
    "agent-sessions",
    encodeURIComponent(input.sessionId),
    `${encodeURIComponent(input.turnId)}.${sha256Hex(body)}.${kind}.json`,
  ].join("/");
}

export function redactedJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, (key, entry) => {
      if (/token|secret|password|authorization|api[_-]?key/i.test(key)) return "[REDACTED]";
      if (typeof entry === "string") {
        return entry
          .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
          .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;"']+/gi, "$1=[REDACTED]")
          .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
          .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_API_KEY]")
          .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
          .replace(/https:\/\/[^/\s:@]+:[^@\s/]+@/g, "https://[REDACTED]@")
          .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
      }
      return entry;
    }) ?? "null";
    if (Buffer.byteLength(serialized) > 2_000_000) {
      return JSON.stringify({ truncated: true, sha256: sha256Hex(serialized) });
    }
    return serialized;
  } catch {
    return JSON.stringify({ unserializable: String(value) });
  }
}
