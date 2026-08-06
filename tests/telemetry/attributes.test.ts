import { describe, expect, it } from "vitest";
import {
  FACTORY_CORRELATION_KEYS,
  correlationAttributes,
  extractCorrelationFromRun,
  redactValue,
  sanitizeAttributes,
  truncateBody,
} from "../../src/telemetry/attributes.js";
import type { FactoryWorkflowInput } from "../../src/temporal/client.js";

const baseRun: FactoryWorkflowInput = {
  runId: "run-1",
  taskId: "task-42",
  repository: "https://github.com/acme/widget",
  baseBranch: "main",
  workflow: "feature",
  deploymentProfile: "staging",
  sandboxProfile: "crabbox",
  attemptId: "attempt-3",
  organization: "acme",
  project: "widget",
};

describe("telemetry attributes", () => {
  it("exports the canonical correlation keys from the architecture spec", () => {
    expect(FACTORY_CORRELATION_KEYS).toEqual([
      "organization_id",
      "project_id",
      "repository_id",
      "task_id",
      "workflow_id",
      "run_id",
      "attempt_id",
      "node_id",
      "agent_session_id",
      "source_commit",
      "artifact_digest",
      "deployment_id",
      "scenario_id",
      "probe_id",
    ]);
  });

  it("maps factory run context to correlation attributes", () => {
    const attrs = correlationAttributes({
      ...extractCorrelationFromRun(baseRun),
      workflowId: `factory-${baseRun.runId}`,
      nodeId: "scout",
      agentSessionId: "sess-9",
      sourceCommit: "abc123",
      artifactDigest: "registry.example/app@sha256:" + "a".repeat(64),
      deploymentId: "deploy-1",
    });

    expect(attrs["factory.organization_id"]).toBe("acme");
    expect(attrs["factory.project_id"]).toBe("widget");
    expect(attrs["factory.repository_id"]).toBe("https://github.com/acme/widget");
    expect(attrs["factory.task_id"]).toBe("task-42");
    expect(attrs["factory.workflow_id"]).toBe("factory-run-1");
    expect(attrs["factory.run_id"]).toBe("run-1");
    expect(attrs["factory.attempt_id"]).toBe("attempt-3");
    expect(attrs["factory.node_id"]).toBe("scout");
    expect(attrs["factory.agent_session_id"]).toBe("sess-9");
    expect(attrs["factory.source_commit"]).toBe("abc123");
    expect(attrs["factory.artifact_digest"]).toMatch(/^registry\.example\/app@sha256:[a-f0-9]{64}$/);
    expect(attrs["factory.deployment_id"]).toBe("deploy-1");
  });

  it("redacts secrets and authorization material", () => {
    expect(redactValue("api_key", "sk-live-secret")).toBe("[REDACTED]");
    expect(redactValue("authorization", "Bearer token-value")).toBe("[REDACTED]");
    expect(redactValue("password", "hunter2")).toBe("[REDACTED]");
    expect(redactValue("factory.task_id", "task-42")).toBe("task-42");
  });

  it("truncates transcript and source bodies instead of storing them whole", () => {
    const transcript = "x".repeat(8_192);
    const source = "function main() {\n".repeat(400);
    expect(truncateBody(transcript)).toBe("[body omitted, 8192 bytes]");
    expect(truncateBody(source)).not.toContain("function main()");
    expect(truncateBody(source)).toMatch(/\[body omitted, \d+ bytes\]/);
  });

  it("sanitizes nested attribute bags for span export", () => {
    const sanitized = sanitizeAttributes({
      "factory.task_id": "task-42",
      "http.request.header.authorization": "Bearer secret",
      transcript: "y".repeat(10_000),
      "tool.output": "console.log('hello')".repeat(200),
      nested: { apiKey: "abc", summary: "ok" },
    });

    expect(sanitized["factory.task_id"]).toBe("task-42");
    expect(sanitized["http.request.header.authorization"]).toBe("[REDACTED]");
    expect(String(sanitized.transcript)).toMatch(/\[body omitted, \d+ bytes\]/);
    expect(String(sanitized["tool.output"])).toMatch(/\[body omitted, \d+ bytes\]/);
    expect((sanitized.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).summary).toBe("ok");
  });
});
