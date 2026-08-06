# Software Factory

A production-only, graph-oriented software factory. Temporal is the workflow authority; PostgreSQL stores projections; Crabbox isolates repository, agent, test, and build execution.

## Run

Start local dependencies (PostgreSQL, Temporal, LiteLLM, Hindsight):

```bash
npm run compose:up
```

Optional profiles:

```bash
npm run compose:obs     # LGTM stack (Grafana on :3000, OTLP on :4318)
npm run compose:worker  # run the Temporal worker inside Docker
npm run compose:down
```

Then run the API and worker on the host:

```bash
npm install
cp .env.example .env
npm run build
npm run dev       # API
npm run worker    # Temporal workers, with FACTORY_WORKER_MODULE=dist/temporal/production-worker.js
```

The API requires PostgreSQL and Temporal. The worker additionally requires Crabbox, Hindsight, Pi resources, and deployment configuration. Startup fails rather than falling back to host-process or in-memory execution.

| Service | URL |
|---------|-----|
| Factory PostgreSQL | `localhost:5432` |
| Temporal gRPC | `localhost:7233` |
| Temporal UI | http://localhost:8080 |
| LiteLLM | http://localhost:4000 |
| Hindsight | http://localhost:8888 |

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

All local dependencies are defined in a single Compose file at [`infra/compose/docker-compose.yml`](infra/compose/docker-compose.yml). Temporal persistence uses a separate Postgres instance from the factory projection database. Optional observability services live in [`infra/observability/docker-compose.lgtm.yml`](infra/observability/docker-compose.lgtm.yml) and are included via the `observability` profile.
