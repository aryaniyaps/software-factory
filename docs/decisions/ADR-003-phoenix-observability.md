# ADR-003: Use Phoenix as the single self-hosted observability backend

## Status
Accepted

## Date
2026-08-06

## Context

The factory emits two observability streams: LiteLLM generations from Pi agent turns, and OpenTelemetry traces from Temporal activities and agent tooling. We need a local, self-hostable backend that can inspect LLM calls and factory workflow spans without operating a multi-service observability stack.

Earlier plans considered:

- **LGTM** (Grafana, Tempo, Loki, Prometheus, OpenTelemetry Collector) — five containers plus configuration for dashboards, scrape targets, and collector pipelines.
- **Langfuse v3 self-hosted** — web, worker, Postgres, ClickHouse, Redis, and MinIO.

Both stacks are disproportionate for current dev and staging needs. The factory already records `factory.*` metrics in code, but we do not yet operate a dedicated metrics backend in local compose.

## Decision

Use **Arize Phoenix** as the only observability container in the `observability` Compose profile:

- Phoenix serves UI and OTLP ingestion on port `6006` (HTTP) and `4317` (gRPC).
- LiteLLM uses the `arize_phoenix` callback with `PHOENIX_COLLECTOR_ENDPOINT=http://phoenix:6006/v1/traces`.
- Factory processes export **traces** to `http://127.0.0.1:6006/v1/traces` by default.
- Factory metrics remain instrumented in code, but the OTLP metrics exporter is **opt-in** via `OTEL_METRICS_EXPORTER_OTLP_ENDPOINT` so a missing metrics backend does not produce export errors.
- `CorrelationContext` is mapped into LiteLLM metadata (`session_id`, `trace_id`, generation/trace names, tags) so Phoenix groups agent runs by factory run, ticket, and phase.

Temporal UI remains the workflow operations surface. Phoenix is the LLM and factory trace viewer.

## Alternatives considered

### LGTM stack
Rejected for local footprint. Tempo, Loki, Prometheus, Grafana, and a collector are useful at scale but add operational cost before we need log aggregation or custom dashboards.

### Langfuse (self-hosted or cloud)
Rejected for footprint. Langfuse v3 self-hosted requires six backing services. Cloud is out of scope for air-gapped or self-hosted deployments.

### Prometheus/Grafana only (metrics without traces)
Rejected. LLM observability requires generation-level traces; metrics alone do not replace Phoenix for debugging agent turns.

## Consequences

- `npm run compose:obs` starts one Phoenix container instead of five LGTM services.
- Grafana dashboards under `infra/observability/grafana/` are removed; factory metrics dashboards are deferred until a metrics backend is chosen.
- Phoenix is distributed under the Elastic License 2.0 (source-available). This is acceptable for internal observability; production licensing should be reviewed if Phoenix is exposed beyond the operator network.
- Operators inspect LLM calls in Phoenix and workflow progress in Temporal UI; there is no unified Grafana home page.
- Re-enabling OTLP metrics export is a single env var when a metrics backend is added later.
