# Software Factory

A production-only, graph-oriented software factory. Temporal is the workflow authority; PostgreSQL stores projections; Crabbox isolates repository, agent, test, and build execution.

## Run

The API and worker are separate processes. Both require the services configured under `infra/compose`.

```bash
npm install
cp .env.example .env
npm run build
npm run dev       # API
npm run worker    # Temporal workers, with FACTORY_WORKER_MODULE=dist/temporal/production-worker.js
```

The API requires PostgreSQL and Temporal. The worker additionally requires Crabbox, Hindsight, Pi resources, and deployment configuration. Startup fails rather than falling back to host-process or in-memory execution.

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

Self-hosted service definitions live under `infra/compose`. Temporal remains the workflow authority; PostgreSQL is a projection/reporting store only.
