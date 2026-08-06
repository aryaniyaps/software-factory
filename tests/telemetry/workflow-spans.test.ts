import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it, beforeEach } from "vitest";
import type { FactoryWorkflowInput } from "../../src/temporal/client.js";
import { instrumentActivities, withSpan } from "../../src/telemetry/bootstrap.js";
import { correlationAttributes, extractCorrelationFromRun } from "../../src/telemetry/attributes.js";

const baseRun: FactoryWorkflowInput = {
  runId: "run-trace",
  taskId: "task-trace",
  repository: "/repo/app",
  baseBranch: "main",
  workflow: "feature",
  deploymentProfile: "staging",
  sandboxProfile: "crabbox",
  attemptId: "1",
  organization: "acme",
  project: "app",
};

describe("workflow spans", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  it("links task intake through tool calls and deployment observation in one trace", async () => {
    const tracer = trace.getTracer("factory-test");
    const root = tracer.startSpan("factory.task_intake", {
      attributes: correlationAttributes({
        ...extractCorrelationFromRun(baseRun),
        workflowId: `factory-${baseRun.runId}`,
      }),
    });

    await context.with(trace.setSpan(context.active(), root), async () => {
      const activities = instrumentActivities({
        runAgent: async (input: {
          run: FactoryWorkflowInput;
          worktree: { path: string; branch: string };
          role: string;
          input: Record<string, unknown>;
        }) => ({
          sessionId: "agent-session-1",
          output: {
            schemaVersion: "agent-output.v1",
            role: input.role,
            status: "succeeded",
            summary: "implemented feature",
            evidenceRefs: ["ev-1"],
            data: { changedFiles: ["src/index.ts"] },
          },
        }),
        deploy: async (_input: { run: FactoryWorkflowInput; artifact: { image: string; digest: string } }) => ({ deployed: true, healthUrl: "https://staging.example/health" }),
        healthCheck: async (_input: { run: FactoryWorkflowInput; url: string; digest: string }) => ({ healthy: true, url: "https://staging.example/health" }),
      });

      await withSpan("factory.tool.call", { tool: "read_file", path: "src/index.ts" }, async () => {
        await activities.runAgent({
          run: baseRun,
          worktree: { path: "/tmp/wt", branch: "factory/run-trace" },
          role: "implement",
          input: { previous: {} },
        });
      });

      const artifact = { image: "registry.example/app", digest: `registry.example/app@sha256:${"b".repeat(64)}` };
      await activities.deploy({ run: baseRun, artifact });
      await activities.healthCheck({
        run: baseRun,
        url: "https://staging.example/health",
        digest: artifact.digest,
      });
    });

    root.end();
    provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const names = spans.map((span) => span.name);
    expect(names).toContain("factory.task_intake");
    expect(names).toContain("factory.tool.call");
    expect(names).toContain("factory.activity.runAgent");
    expect(names).toContain("factory.activity.deploy");
    expect(names).toContain("factory.activity.healthCheck");

    const rootSpan = spans.find((span) => span.name === "factory.task_intake");
    const childSpans = spans.filter((span) => span.parentSpanContext?.spanId === rootSpan?.spanContext().spanId);
    expect(childSpans.length).toBeGreaterThan(0);

    const traceIds = new Set(spans.map((span) => span.spanContext().traceId));
    expect(traceIds.size).toBe(1);
  });

  it("does not export secrets or full transcript bodies on spans", async () => {
    const tracer = trace.getTracer("factory-test");
    const root = tracer.startSpan("factory.task_intake");
    await context.with(trace.setSpan(context.active(), root), async () => {
      const activities = instrumentActivities({
        runAgent: async (_input: {
          run: FactoryWorkflowInput;
          worktree: { path: string; branch: string };
          role: string;
          input: Record<string, unknown>;
        }) => ({
          sessionId: "sess",
          output: {
            schemaVersion: "agent-output.v1",
            role: "scout",
            status: "succeeded",
            summary: "ok",
            evidenceRefs: [],
            data: {},
          },
        }),
      });

      await activities.runAgent({
        run: baseRun,
        worktree: { path: "/tmp/wt", branch: "factory/run-trace" },
        role: "scout",
        input: {
          previous: {},
          apiKey: "sk-secret",
          transcript: "line\n".repeat(2_000),
          source: "export function secret() {}".repeat(100),
        },
      });
    });
    root.end();
    provider.forceFlush();

    const serialized = JSON.stringify(exporter.getFinishedSpans().flatMap((span) => Object.entries(span.attributes)));
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("export function secret()");
    expect(serialized).not.toMatch(/line\\nline\\n/);
  });
});
