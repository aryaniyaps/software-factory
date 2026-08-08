import { describe, expect, it } from "vitest";
import { createAgentExecutionRecorder } from "../../src/evidence/agent-execution-recorder.js";
import { sha256Hex, type ObjectStore } from "../../src/evidence/object-store.js";

function memoryObjectStore(): ObjectStore & { bodies: Map<string, Buffer> } {
  const bodies = new Map<string, Buffer>();
  return {
    bodies,
    async put(path, body) {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      bodies.set(path, bytes);
      return { sha256: sha256Hex(bytes), uri: `memory://${path}` };
    },
    async get(path) {
      const body = bodies.get(path);
      if (!body) throw new Error(`missing ${path}`);
      return body;
    },
    async verify(path, expectedSha256) {
      return sha256Hex(await this.get(path)) === expectedSha256;
    },
  };
}

describe("agent execution recorder", () => {
  it("stores bodies once and returns Temporal-ready turn and tool descriptors", async () => {
    const objects = memoryObjectStore();
    const recorder = createAgentExecutionRecorder(objects);
    const execution = await recorder.recordTurn({
      runId: "run",
      sessionId: "session",
      role: "implement",
      nodeAttemptId: "attempt",
      turnId: "turn-0",
      turnIndex: 0,
      prompt: "use token=secret-value",
      systemPrompt: "system",
      output: "done",
      startedAt: "2026-08-08T00:00:00.000Z",
      completedAt: "2026-08-08T00:00:02.000Z",
      toolCalls: [{
        callId: "call-1",
        toolName: "read",
        status: "succeeded",
        input: { path: "README.md", apiKey: "secret" },
        output: { text: "ok" },
        startedAt: "2026-08-08T00:00:00.500Z",
        completedAt: "2026-08-08T00:00:01.000Z",
      }],
    });

    expect(execution.turn.schemaVersion).toBe("agent-turn.v2");
    expect(execution.toolCalls).toHaveLength(1);
    expect(execution.toolCalls[0]).toMatchObject({
      schemaVersion: "tool-call.v2",
      recordId: "tool:attempt:session:turn-0:call-1",
      status: "succeeded",
      input: { redaction: "secrets", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      output: { redaction: "secrets", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect([...objects.bodies.values()].map((body) => body.toString())).not.toContain(expect.stringContaining("secret-value"));
    expect([...objects.bodies.values()].map((body) => body.toString())).not.toContain(expect.stringContaining('"secret"'));
  });
});
