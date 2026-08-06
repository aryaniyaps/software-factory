# Software Factory

A production-only, graph-oriented software factory. Temporal is the workflow authority; PostgreSQL stores projections; Crabbox isolates repository, agent, test, and build execution.

## Run

Start local dependencies (PostgreSQL, Temporal, LiteLLM, Hindsight):

```bash
npm run compose:up
```

Optional profiles:

```bash
npm run compose:obs     # Phoenix UI on http://localhost:6006
npm run compose:worker  # run the Temporal worker inside Docker
npm run compose:down
```

Then run the API and worker on the host:

```bash
npm install
cp .env.example .env
npm run db:migrate   # apply Drizzle baseline before API/worker startup
npm run build
npm run dev       # API
npm run worker    # Temporal workers, with FACTORY_WORKER_MODULE=dist/temporal/production-worker.js
```

The API and worker run `npm run db:migrate` automatically on startup. After a destructive schema cutover, reset only the factory projection database (not Temporal's separate Postgres) and re-apply migrations:

```bash
docker compose -f infra/compose/docker-compose.yml down -v postgres
docker compose -f infra/compose/docker-compose.yml up -d postgres
npm run db:migrate
```

Schema changes must be generated and reviewed: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new file under `drizzle/`, then apply with `npm run db:migrate`.

Integration tests against disposable PostgreSQL:

```bash
docker run -d --name sf-test-postgres -e POSTGRES_USER=factory -e POSTGRES_PASSWORD=factory -e POSTGRES_DB=factory -p 5433:5432 postgres:17-alpine
npm run test:db
```

The API requires PostgreSQL and Temporal. The worker additionally requires Crabbox, Hindsight, Pi resources, and deployment configuration. Startup fails rather than falling back to host-process or in-memory execution.

| Service | URL |
|---------|-----|
| Factory PostgreSQL | `localhost:5432` |
| Temporal gRPC | `localhost:7233` |
| Temporal UI | http://localhost:8080 |
| LiteLLM | http://localhost:4000 |
| Hindsight | http://localhost:8888 |
| Phoenix (obs profile) | http://localhost:6006 |

## Execution flow

```text
API / GitHub reconciliation
  -> Temporal workflow
  -> repository + worktree
  -> security scan
  -> scout -> plan -> implement
  -> checks / bounded repair
  -> review
  -> immutable image build
  -> digest-pinned deploy
  -> health check / rollback
  -> PostgreSQL projection
```

Pi sessions use immutable, role-specific resources inside Gondolin. Hindsight memory is scoped by organization/project and tagged by repository, run, role, and phase. Repository commands and builds run through Crabbox; the host process is never an execution fallback.

## Services

All local dependencies are defined in a single Compose file at [`infra/compose/docker-compose.yml`](infra/compose/docker-compose.yml). Temporal persistence uses a separate Postgres instance from the factory projection database. Optional observability is a single Phoenix container in [`infra/observability/docker-compose.phoenix.yml`](infra/observability/docker-compose.phoenix.yml), included via the `observability` profile. Factory processes export OTLP traces to Phoenix at `http://127.0.0.1:6006`; metrics export is opt-in via `OTEL_METRICS_EXPORTER_OTLP_ENDPOINT`.

## Data and SDK boundaries

| Concern | Owner |
|---------|-------|
| PostgreSQL schema, migrations, typed queries | Drizzle (`src/db/schema.ts`, `drizzle/`, `npm run db:generate` / `db:migrate`) |
| Workflow orchestration | Temporal |
| Agent memory (recall/reflect/retain) | `@vectorize-io/hindsight-client` |
| Context7 research | `@modelcontextprotocol/client` (Streamable HTTP transport) |
| GitHub Projects | `@octokit/graphql` |
| LLM routing / observability metadata | Pi model runtime → LiteLLM; correlation metadata in `src/integrations/correlation.ts` |

Application code must not call `pool.query` directly or reimplement SDK transports for the integrations above.
