import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("software-factory");

export const nodeDuration = meter.createHistogram("factory.node.duration_ms", {
  description: "Factory workflow node duration in milliseconds",
  unit: "ms",
});

export const toolCalls = meter.createCounter("factory.tool.calls", {
  description: "Factory agent tool invocations",
});

export const deploymentObservations = meter.createCounter("factory.deployment.observations", {
  description: "Deployment health observations after release",
});

export const workerTaskLatency = meter.createHistogram("factory.worker.task_latency_ms", {
  description: "Temporal activity execution latency in milliseconds",
  unit: "ms",
});

export const evidenceLinks = meter.createCounter("factory.evidence.links", {
  description: "Evidence references attached to telemetry events",
});

export function recordNodeDuration(attributes: Record<string, string>, durationMs: number): void {
  nodeDuration.record(durationMs, attributes);
}

export function recordToolCall(attributes: Record<string, string>): void {
  toolCalls.add(1, attributes);
}

export function recordDeploymentObservation(attributes: Record<string, string>, healthy: boolean): void {
  deploymentObservations.add(1, { ...attributes, "factory.healthy": String(healthy) });
}

export function recordWorkerTaskLatency(attributes: Record<string, string>, durationMs: number): void {
  workerTaskLatency.record(durationMs, attributes);
}

export function recordEvidenceLinks(attributes: Record<string, string>, count: number): void {
  if (count <= 0) return;
  evidenceLinks.add(count, attributes);
}
