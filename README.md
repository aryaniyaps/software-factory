# Software Factory

A production-only, graph-oriented software factory. Temporal orchestrates workflow state; PostgreSQL stores projections and evidence; Crabbox isolates repository, agent, test, and build execution. There is no host-process or in-memory fallback for production paths.

## Factory assembly line

Each run walks a fixed node graph. Agent nodes use Pi sessions inside Gondolin with role-specific tools, skills, and (optionally) per-role models. `maintainability_critic` is an agent role nested inside `maintainability_assess`, not a separate node.

```mermaid
flowchart LR
  prep[prepare_repository] --> wt[create_worktree] --> sec[security_scan]
  sec --> scout --> plan --> impl[implement]
  impl --> checks[deterministic_checks] --> maint[maintainability_assess]
  checks -.->|repair loop| checks
  maint -.->|refactor loop| maint
  maint --> bev[behavioral_verify] --> review --> build[build_artifact] --> release[release_controller]
  release -->|promoted| ok([succeeded])
  release -->|else| stop([fail / rollback])
```

### Nodes

| Node | Kind | Queue | What it does | Model alias | Typical failure |
|------|------|-------|--------------|-------------|------------------------|
| `prepare_repository` | deterministic | control | Clone or refresh the target repository into the cache | — | clone/fetch failure |
| `create_worktree` | deterministic | control | Create an isolated git worktree for this run | — | worktree failure |
| `security_scan` | deterministic | control | Scan the worktree for policy/security violations | — | reject or budget exhausted → fail |
| `scout` | agent | agent | Map repository reality without writing code | `FACTORY_MODEL_SCOUT` / default | escalate / fail |
| `plan` | agent | agent | Produce an actionable plan and acceptance checks | `FACTORY_MODEL_PLAN` / default | escalate / fail |
| `implement` | agent | agent | Apply the plan in the worktree using TDD | `FACTORY_MODEL_IMPLEMENT` / default | fail |
| `deterministic_checks` | deterministic | build | Run lint, typecheck, unit tests, and other gates | — | fail → repair loop |
| `repair` | agent | agent | Fix failing checks or scoped maintainability debt | `FACTORY_MODEL_REPAIR` / default | fail after repair budget |
| `maintainability_assess` | hybrid | build + agent | Fitness scoring + `maintainability_critic` agent + policy gate | `FACTORY_MODEL_CRITIC` (nested) | policy block → fail; repairable → refactor loop |
| `behavioral_verify` | deterministic | verifier | Run behavioral scenarios against the worktree | — | fail |
| `review` | agent | agent | Gate on correctness, security, and regressions | `FACTORY_MODEL_REVIEW` / default | fail |
| `build_artifact` | deterministic | build | Build an immutable, digest-pinned container image | — | build failure |
| `release_controller` | deploy | deploy | Preview deploy, canary (10%→50%→100%), observe, promote or rollback | — | fail / rollback |

Model selection uses `FACTORY_MODEL` (and optional `FACTORY_MODEL_<ROLE>` overrides) against a Pi provider such as `openai-codex`. See [Configure models](#configure-models).

### Edges and assembly lines

| From | To | Gate | Condition / bound |
|------|----|------|-------------------|
| `prepare_repository` | `create_worktree` | ok | skipped when `continuation.worktree` is set |
| `create_worktree` | `security_scan` | ok | same skip as above |
| `security_scan` | `scout` | pass | `security.passed`; max 2 attempts |
| `scout` | `plan` | ok | agent `succeeded`; max 2 attempts |
| `plan` | `implement` | ok | agent `succeeded`; max 2 attempts |
| `implement` | `deterministic_checks` | ok | agent `succeeded` |
| `deterministic_checks` | `maintainability_assess` | pass | all checks passed |
| `deterministic_checks` | `repair` | fail | while `repairAttempts ≤ 2` |
| `repair` | `deterministic_checks` | fixed | check-repair mode; repair fail → run fail |
| `maintainability_assess` | `behavioral_verify` | pass | fitness + critic + policy pass |
| `maintainability_assess` | `repair` | repairable | maintainability_refactor mode; max 2 refactor attempts |
| `repair` | `deterministic_checks` | ok | behavior gate after refactor |
| `deterministic_checks` | `maintainability_assess` | pass | recheck after refactor |
| `behavioral_verify` | `review` | pass | scenarios passed |
| `review` | `build_artifact` | ok | agent `succeeded`; max 2 attempts |
| `build_artifact` | `release_controller` | ok | image built |
| `release_controller` | *(terminal)* | promoted | canary stages 10% → 50% → 100% |
| `release_controller` | *(terminal)* | else | `rolled_back` or `failed` |
| any | *(terminal)* | cancel | `cancelFactory` signal → `cancelled` |

**Terminals:** `succeeded`, `failed`, `rolled_back`, `cancelled`.

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js `>=24` | See `engines` in `package.json` |
| Docker + Docker Compose | Local stack and Crabbox container runtime |
| [Crabbox](https://github.com/nicobailon/crabbox) CLI | Worker fails closed without `crabbox --version` on PATH |
| `pi` CLI | Required for `npm run bootstrap:pi-resources` |
| Pi provider auth | Codex OAuth in `~/.pi/agent/auth.json`, or another Pi builtin provider |
| SSH access to deploy host | For digest-pinned staging deploy (`FACTORY_DEPLOY_HOST`) |
| Optional | Context7 API key, web-search provider keys, Phoenix (`compose:obs`) |

## Quick start

```bash
# 1. Install Crabbox and verify it works
crabbox --version

# 2. Start local dependencies (Postgres, Temporal, Hindsight)
npm run compose:up

# 3. Configure environment
cp .env.example .env
# Edit .env — see Environment reference below

# 4. Install, migrate, build
npm install
npm run db:migrate
npm run build

# 5. Bootstrap Pi role resources (needs writable PI_RESOURCE_ROOT)
# Default is /opt/software-factory/pi-resources — override in .env if needed:
#   PI_RESOURCE_ROOT=$HOME/software-factory-pi-resources
npm run bootstrap:pi-resources

# 6. Start API and worker (two terminals)
npm run dev       # API on FACTORY_PORT (default 8787)
npm run worker    # requires FACTORY_WORKER_MODULE=dist/src/temporal/production-worker.js
```

The API and worker run `npm run db:migrate` automatically on startup.

### Required env vars for a real run

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Factory projection database |
| `TEMPORAL_ADDRESS` | Temporal gRPC (`localhost:7233`) |
| `FACTORY_MODEL_PROVIDER` + `FACTORY_MODEL` | Pi provider + default model (e.g. `openai-codex` / `gpt-5.6-luna`) |
| `FACTORY_ORGANIZATION` + `FACTORY_PROJECT` | Hindsight memory bank scope |
| `FACTORY_IMAGE` | Container image name for build activities |
| `FACTORY_DEPLOY_HOST` + `FACTORY_HEALTH_URL` | Staging deploy target and health check |
| `FACTORY_WORKER_MODULE` | `dist/src/temporal/production-worker.js` |
| `PI_RESOURCE_ROOT` | Writable path for bootstrapped Pi resources |

## Configure models

Agents call Pi builtin providers directly (default `openai-codex`). Auth for Codex subscription comes from `~/.pi/agent/auth.json` (override with `PI_AUTH_PATH`).

```bash
FACTORY_MODEL_PROVIDER=openai-codex
FACTORY_MODEL=gpt-5.6-luna
# Optional per-role overrides (concrete model ids):
FACTORY_MODEL_PLAN=gpt-5.6-luna
FACTORY_MODEL_IMPLEMENT=gpt-5.6-luna
# FACTORY_MODEL_SCOUT=
# FACTORY_MODEL_REPAIR=
# FACTORY_MODEL_REVIEW=
# FACTORY_MODEL_CRITIC=
```

| Role | Env var | Aptness |
|------|---------|---------|
| scout | `FACTORY_MODEL_SCOUT` | Faster / cheaper exploration |
| plan | `FACTORY_MODEL_PLAN` | Strong reasoning |
| implement | `FACTORY_MODEL_IMPLEMENT` | Strong coding |
| repair | `FACTORY_MODEL_REPAIR` | Strong debugging |
| review | `FACTORY_MODEL_REVIEW` | Strong judgment / security |
| maintainability_critic | `FACTORY_MODEL_CRITIC` | Strong analysis, read-only |

Resolution lives in [`src/agents/model-resolver.ts`](src/agents/model-resolver.ts). Restart the worker after changing model env vars.

## Local dashboard

A minimal Vite + React dashboard lives at `apps/dashboard/` for local run monitoring (list runs, create tasks, live pipeline graph, cancel/rerun). It proxies API calls to the factory server — no CORS changes required.

```bash
# Terminal 1 — infrastructure + API
npm run compose:up
npm run dev

# Terminal 2 — Temporal worker
npm run worker

# Terminal 3 — dashboard (http://localhost:5173)
npm run dashboard:dev
```

If `FACTORY_API_TOKEN` is set on the API server, copy it to `apps/dashboard/.env` as `VITE_FACTORY_API_TOKEN` for write routes (create task, cancel, rerun).

Build the dashboard for a production bundle check:

```bash
npm run dashboard:build
```

## Start a run

```bash
curl -sS -X POST http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "repository": "https://github.com/org/repo.git",
    "title": "Add feature X",
    "description": "Concrete acceptance criteria and scope for the change."
  }'
# → { "id": "<runUuid>" }
```

If `FACTORY_API_TOKEN` is set, include `Authorization: Bearer <token>` on write routes.

## Observe and control

| Action | How |
|--------|-----|
| Temporal UI | http://localhost:8080 |
| Run status | `GET /runs/:id` |
| Run events | `GET /runs/:id/events` |
| Cancel | `POST /runs/:id/cancel` |
| Evidence graph | `GET /factory/runs/:runId/graph` |
| Gates / scenarios / probes | `GET /factory/runs/:runId/gates` etc. |
| Rerun node | `POST /factory/runs/:runId/rerun` with `{ "node": "implement" }` |
| Rollback release | `POST /factory/runs/:runId/rollback` |
| Traces (optional) | `npm run compose:obs` → Phoenix at http://localhost:6006 |

Compose profiles:

```bash
npm run compose:obs      # Phoenix observability
npm run compose:worker   # run the Temporal worker inside Docker
npm run compose:down
```

## Environment reference

### Database and workflow

| Variable | Default | Required |
|----------|---------|----------|
| `DATABASE_URL` | `postgres://factory:factory@localhost:5432/factory` | yes |
| `TEST_DATABASE_URL` | `localhost:5433` | tests only |
| `TEMPORAL_ADDRESS` | `localhost:7233` | yes |
| `TEMPORAL_NAMESPACE` | `default` | yes |
| `FACTORY_PORT` | `8787` | no |
| `FACTORY_API_TOKEN` | — | no (enables Bearer auth on writes) |
| `FACTORY_WORKER_MODULE` | — | yes for worker |

### LLM routing

| Variable | Required |
|----------|----------|
| `FACTORY_MODEL_PROVIDER` | no (`openai-codex`) |
| `FACTORY_MODEL` | no (`gpt-5.6-luna`) |
| `FACTORY_MODEL_<ROLE>` | no (per-role override) |
| `PI_AUTH_PATH` | no (defaults to `~/.pi/agent/auth.json`) |
| `PI_MODELS_PATH` | no (optional custom models overlay; builtins used when unset) |

### Agents and sandbox

| Variable | Required |
|----------|----------|
| `PI_RESOURCE_ROOT` | yes (writable; bootstrap target) |
| `CRABBOX_BIN` | no (`crabbox`) |
| `CRABBOX_SLUG_PREFIX` | no |
| `GONDOLIN_EXTENSION_PATH` | no |
| `WORKTREE_ROOT` | no |
| `REPOSITORY_CACHE_ROOT` | no |
| `FACTORY_ORGANIZATION` / `FACTORY_PROJECT` | yes |
| `PI_WEB_SEARCH_PROVIDERS` | no |
| `CONTEXT7_MCP_URL` / `CONTEXT7_API_KEY` | no |
| `WEB_SEARCH_URL` / `WEB_SEARCH_API_KEY` | no |

### Build and deploy

| Variable | Required |
|----------|----------|
| `FACTORY_IMAGE` | yes |
| `FACTORY_DEPLOY_HOST` | yes |
| `FACTORY_HEALTH_URL` | yes |
| `FACTORY_DEPLOYMENT_PROFILE` | no (`staging`) |
| `FACTORY_PROVENANCE_SIGNING_KEY` | no |
| `FACTORY_ARTIFACT_DIGEST` / `FACTORY_PREVIOUS_DIGEST` | no |

### Evidence and observability

| Variable | Default |
|----------|---------|
| `EVIDENCE_OBJECT_STORE_ROOT` | `/tmp/software-factory-evidence` |
| `EVIDENCE_MAX_INLINE_BYTES` | `0` |
| `HINDSIGHT_BASE_URL` | `http://localhost:8888` |
| `HINDSIGHT_API_KEY` | — |
| `HINDSIGHT_TEMPLATE_PATH` | `infra/hindsight/factory-bank-template.json` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:6006` (with `compose:obs`) |

## Database, schema, and tests

Schema changes: edit `src/db/schema.ts` → `npm run db:generate` → commit `drizzle/` → `npm run db:migrate`.

After a destructive schema cutover, reset only the factory projection database (not Temporal's separate Postgres):

```bash
docker compose -f infra/compose/docker-compose.yml down -v postgres
docker compose -f infra/compose/docker-compose.yml up -d postgres
npm run db:migrate
```

Integration tests against disposable PostgreSQL:

```bash
docker run -d --name sf-test-postgres \
  -e POSTGRES_USER=factory -e POSTGRES_PASSWORD=factory -e POSTGRES_DB=factory \
  -p 5433:5432 postgres:17-alpine
npm run test:db
```

Other useful commands:

```bash
npm test              # unit tests
npm run db:studio     # Drizzle Studio
npm run factory:contract:check   # product-graph contract validation
```

## Services

All local dependencies are in [`infra/compose/docker-compose.yml`](infra/compose/docker-compose.yml). Temporal persistence uses a separate Postgres instance from the factory projection database. Phoenix observability is in [`infra/observability/docker-compose.phoenix.yml`](infra/observability/docker-compose.phoenix.yml) (profile `observability`).

| Service | URL |
|---------|-----|
| Factory PostgreSQL | `localhost:5432` |
| Temporal gRPC | `localhost:7233` |
| Temporal UI | http://localhost:8080 |
| Hindsight | http://localhost:8888 |
| Phoenix (obs profile) | http://localhost:6006 |
| Factory API | http://localhost:8787 |

The API requires PostgreSQL and Temporal. The worker additionally requires Crabbox, Hindsight, Pi resources, and deployment configuration. Startup fails rather than falling back to host-process or in-memory execution.

## Data and SDK boundaries

| Concern | Owner |
|---------|-------|
| PostgreSQL schema, migrations, typed queries | Drizzle (`src/db/schema.ts`, `drizzle/`, `npm run db:generate` / `db:migrate`) |
| Workflow orchestration | Temporal |
| Agent memory (recall/reflect/retain) | `@vectorize-io/hindsight-client` |
| Context7 research | `@modelcontextprotocol/client` (Streamable HTTP transport) |
| GitHub Projects | `@octokit/graphql` |
| LLM routing / observability metadata | Pi model runtime (`openai-codex` etc.); correlation metadata in `src/integrations/correlation.ts`; OTEL → Phoenix when `compose:obs` |

Application code must not call `pool.query` directly or reimplement SDK transports for the integrations above.

## Architecture decisions

See [`docs/decisions/`](docs/decisions/) for ADRs on sandbox boundaries, role-specific agent resources, Phoenix observability, MCP governance, and 12-factor agent conformance.

## Impeccable (design skill)

This repo ships [Impeccable](https://impeccable.style/) for Cursor and factory Pi agents (`implement`, `review`).

**Cursor:** Enable **Agent Skills** in Cursor settings so `.cursor/skills/impeccable/` loads. Refresh the project install with `npx impeccable update`. Before UI work, run `/impeccable init` in chat to capture product/design context.

**Factory Pi:** The Pi skill is vendored at `src/agents/skills/impeccable/` (see `REVISION` for the pinned version). Refresh with `tsx scripts/vendor-impeccable.ts [version]`, then `npm run bootstrap:pi-resources`.
