import type { AgentSessionHooks } from "../temporal/activities/agent.js";
import type { ObjectStore } from "../evidence/object-store.js";
import { sha256Hex } from "../evidence/object-store.js";
import type { Database } from "./database.js";
import { agentSessions, agentTurns, toolCalls } from "./schema.js";

export function createAgentSessionLedger(
  db: Database,
  objectStore: ObjectStore,
): AgentSessionHooks {
  return {
    async recordTurn(input) {
      const transcript = safeSerialize({
        schemaVersion: "agent-transcript.v1",
        role: input.role,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        output: input.output,
      });
      const objectPath = [
        input.runId,
        "agent-sessions",
        encodeURIComponent(input.sessionId),
        `${encodeURIComponent(input.turnId)}.${sha256Hex(transcript)}.json`,
      ].join("/");
      const stored = await objectStore.put(objectPath, transcript);
      await objectStore.verify(objectPath, stored.sha256);

      await db.transaction(async (tx) => {
        await tx.insert(agentSessions).values({
          runId: input.runId,
          sessionId: input.sessionId,
          role: input.role,
          nodeAttemptId: input.nodeAttemptId,
          startedAt: new Date(input.startedAt),
        }).onConflictDoNothing({
          target: [agentSessions.runId, agentSessions.sessionId],
        });

        await tx.insert(agentTurns).values({
          runId: input.runId,
          sessionId: input.sessionId,
          turnId: input.turnId,
          turnIndex: input.turnIndex,
          startedAt: new Date(input.startedAt),
          completedAt: new Date(input.completedAt),
          transcriptUri: stored.uri,
          transcriptSha256: stored.sha256,
        }).onConflictDoNothing({
          target: [agentTurns.runId, agentTurns.sessionId, agentTurns.turnId],
        });

        for (const call of input.toolCalls) {
          const inputBody = safeSerialize(call.input);
          const outputBody = safeSerialize(call.output);
          const callRoot = [
            input.runId,
            "agent-sessions",
            encodeURIComponent(input.sessionId),
            "tool-calls",
            encodeURIComponent(input.turnId),
            encodeURIComponent(call.callId),
          ].join("/");
          const inputPath = `${callRoot}.${sha256Hex(inputBody)}.input.json`;
          const outputPath = `${callRoot}.${sha256Hex(outputBody)}.output.json`;
          const storedInput = await objectStore.put(inputPath, inputBody);
          const storedOutput = await objectStore.put(outputPath, outputBody);
          await objectStore.verify(inputPath, storedInput.sha256);
          await objectStore.verify(outputPath, storedOutput.sha256);
          await tx.insert(toolCalls).values({
            runId: input.runId,
            sessionId: input.sessionId,
            turnId: input.turnId,
            callId: call.callId,
            toolName: call.toolName,
            status: call.status,
            inputSha256: storedInput.sha256,
            outputSha256: storedOutput.sha256,
            inputUri: storedInput.uri,
            outputUri: storedOutput.uri,
            startedAt: new Date(call.startedAt),
            completedAt: new Date(call.completedAt),
          }).onConflictDoNothing({
            target: [toolCalls.runId, toolCalls.sessionId, toolCalls.turnId, toolCalls.callId],
          });
        }
      });
    },
  };
}

function safeSerialize(value: unknown): string {
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
      return JSON.stringify({ truncated: true, sha256: "body-exceeded-2mb" });
    }
    return serialized;
  } catch {
    return JSON.stringify({ unserializable: String(value) });
  }
}
