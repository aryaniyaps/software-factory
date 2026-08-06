import { context, diag, DiagConsoleLogger, DiagLogLevel, trace, type Span } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import {
  correlationAttributes,
  correlationFromActivityInput,
  sanitizeAttributes,
  type FactoryCorrelationContext,
} from "./attributes.js";
import {
  recordDeploymentObservation,
  recordEvidenceLinks,
  recordNodeDuration,
  recordWorkerTaskLatency,
} from "./metrics.js";

export interface TelemetryOptions {
  serviceName?: string;
  serviceVersion?: string;
  endpoint?: string;
  enabled?: boolean;
}

let sdk: NodeSDK | undefined;
let initialized = false;

export function initTelemetry(options: TelemetryOptions = {}): void {
  if (initialized) return;
  initialized = true;

  const enabled = options.enabled ?? process.env.OTEL_SDK_DISABLED !== "true";
  if (!enabled) return;

  if (process.env.OTEL_LOG_LEVEL === "debug") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const endpoint = options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:6006";
  const metricsEndpoint = process.env.OTEL_METRICS_EXPORTER_OTLP_ENDPOINT;
  const serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "software-factory";
  const serviceVersion = options.serviceVersion ?? process.env.npm_package_version ?? "0.0.0";

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    ...(metricsEndpoint
      ? {
          metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ url: `${metricsEndpoint}/v1/metrics` }),
            exportIntervalMillis: 15_000,
          }),
        }
      : {}),
  });

  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = undefined;
  initialized = false;
}

export async function withSpan<T>(
  name: string,
  attributes: Record<string, unknown>,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const tracer = trace.getTracer("software-factory");
  return tracer.startActiveSpan(name, { attributes: sanitizeAttributes(attributes) as Record<string, string> }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: 2, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

function activityAttributes(name: string, input: unknown): Record<string, string> {
  const correlation = correlationFromActivityInput(input);
  const attributes: Record<string, unknown> = {
    "factory.activity": name,
    ...(correlation ? correlationAttributes(correlation) : {}),
  };
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (record.input !== undefined) attributes["factory.activity.input"] = record.input;
    if (record.role !== undefined) attributes["factory.node_id"] = record.role;
  }
  return sanitizeAttributes(attributes) as Record<string, string>;
}

function recordActivityMetrics(name: string, attributes: Record<string, string>, durationMs: number, result: unknown): void {
  recordWorkerTaskLatency(attributes, durationMs);
  recordNodeDuration({ ...attributes, "factory.node_id": attributes["factory.node_id"] ?? name }, durationMs);

  if (name === "healthCheck" && result && typeof result === "object") {
    const healthy = (result as { healthy?: boolean }).healthy === true;
    recordDeploymentObservation(attributes, healthy);
  }

  if (name === "runAgent" && result && typeof result === "object") {
    const output = (result as { output?: { evidenceRefs?: string[] } }).output;
    recordEvidenceLinks(attributes, output?.evidenceRefs?.length ?? 0);
  }
}

export function instrumentActivities<T extends Record<string, (...args: any[]) => Promise<any>>>(activities: T): T {
  const instrumented = {} as T;
  for (const [name, handler] of Object.entries(activities)) {
    instrumented[name as keyof T] = (async (...args: unknown[]) => {
      const input = args[0];
      const attributes = activityAttributes(name, input);
      const started = performance.now();
      return withSpan(`factory.activity.${name}`, attributes, async () => handler(...args))
        .then((result) => {
          recordActivityMetrics(name, attributes, performance.now() - started, result);
          return result;
        });
    }) as T[keyof T];
  }
  return instrumented;
}

export function startTaskIntakeSpan(correlation: FactoryCorrelationContext): Span {
  const tracer = trace.getTracer("software-factory");
  return tracer.startSpan("factory.task_intake", { attributes: correlationAttributes(correlation) });
}

export function runInSpan<T>(span: Span, fn: () => Promise<T> | T): Promise<T> {
  return context.with(trace.setSpan(context.active(), span), async () => fn());
}
