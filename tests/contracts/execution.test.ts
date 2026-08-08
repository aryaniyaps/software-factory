import { describe, expect, it } from "vitest";
import {
  FACTORY_EXECUTION_GRAPH_V2,
  appendExecutionRecord,
  createExecutionLedger,
  executionView,
} from "../../src/contracts/execution.js";

describe("Temporal execution view contract", () => {
  it("publishes the complete renderable topology from the workflow contract", () => {
    expect(FACTORY_EXECUTION_GRAPH_V2.nodes.map((node) => node.id)).toEqual([
      "prepare_repository",
      "create_worktree",
      "security_scan",
      "discovery_plan",
      "implement",
      "deterministic_checks",
      "repair",
      "maintainability_assess",
      "behavioral_verify",
      "review",
      "build_artifact",
      "release_controller",
    ]);
    expect(FACTORY_EXECUTION_GRAPH_V2.edges).toContainEqual({
      id: "deterministic_checks:repair",
      source: "deterministic_checks",
      target: "repair",
      condition: "failed",
    });
  });

  it("deduplicates durable execution records and exposes them through the view", () => {
    let ledger = createExecutionLedger({
      workflowId: "factory-123",
      runId: "123",
      taskId: "123",
      repository: "https://github.com/acme/app.git",
      prompt: "ship it",
      startedAt: "2026-08-08T00:00:00.000Z",
    });
    const attempt = {
      schemaVersion: "node-attempt.v2" as const,
      recordId: "attempt:prepare:1",
      nodeId: "prepare_repository",
      attemptId: "prepare-1",
      status: "succeeded" as const,
      startedAt: "2026-08-08T00:00:01.000Z",
      completedAt: "2026-08-08T00:00:02.000Z",
      evidenceRefs: ["object:prepare-log"],
    };

    ledger = appendExecutionRecord(ledger, attempt);
    ledger = appendExecutionRecord(ledger, attempt);
    const view = executionView(ledger);

    expect(view.schemaVersion).toBe("factory-execution-view.v2");
    expect(view.stateRevision).toBe(1);
    expect(view.attempts).toEqual([attempt]);
    expect(view.graph.nodes.find((node) => node.id === "prepare_repository")?.status).toBe("succeeded");
    expect(view.graph.nodes.find((node) => node.id === "create_worktree")?.status).toBe("idle");
  });

  it("keeps an unterminated tool call visibly running", () => {
    let ledger = createExecutionLedger({
      workflowId: "factory-123",
      runId: "123",
      taskId: "123",
      repository: "repo",
      prompt: "prompt",
      startedAt: "2026-08-08T00:00:00.000Z",
    });
    ledger = appendExecutionRecord(ledger, {
      schemaVersion: "tool-call.v2",
      recordId: "call:attempt:session:turn:call-1",
      attemptId: "attempt",
      sessionId: "session",
      turnId: "turn",
      callId: "call-1",
      toolName: "read",
      status: "running",
      input: { objectId: "input", sha256: "a".repeat(64), uri: "file:///input", redaction: "secrets" },
      startedAt: "2026-08-08T00:00:01.000Z",
    });

    expect(executionView(ledger).toolCalls).toHaveLength(1);
    expect(executionView(ledger).toolCalls[0]?.status).toBe("running");
  });
});
