import { describe, expect, it } from "vitest";
import { parseAgentOutput, parseNodeResult } from "../../src/contracts/nodes.js";

describe("activity contracts", () => {
  const output = {
    schemaVersion: "agent-output.v1",
    role: "implement",
    status: "succeeded",
    summary: "implemented the change",
    evidenceRefs: ["ev-1"],
    data: { files: ["src/example.ts"] },
  } as const;

  it("accepts role-discriminated agent output", () => {
    expect(parseAgentOutput(output)).toEqual(output);
  });

  it("rejects invalid agent JSON before workflow progress", () => {
    expect(() => parseAgentOutput("not json")).toThrow();
    expect(() => parseAgentOutput({ ...output, role: "unknown" })).toThrow();
    expect(() => parseAgentOutput({ ...output, evidenceRefs: [] })).toThrow();
  });

  it("requires evidence on node results", () => {
    expect(parseNodeResult({
      schemaVersion: "node-result.v1",
      node: "implement",
      attemptId: "attempt-1",
      status: "succeeded",
      evidenceRefs: ["ev-1"],
      startedAt: "2026-08-06T00:00:00.000Z",
      completedAt: "2026-08-06T00:01:00.000Z",
      output: output.data,
    }).status).toBe("succeeded");
    expect(() => parseNodeResult({
      schemaVersion: "node-result.v1", node: "implement", attemptId: "attempt-1", status: "succeeded",
      evidenceRefs: [], startedAt: "2026-08-06T00:00:00.000Z", completedAt: "2026-08-06T00:01:00.000Z",
    })).toThrow();
  });
});
