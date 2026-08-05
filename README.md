# Software Factory

A code-defined, graph-oriented software factory. Temporal coordinates deterministic and Pi-backed workflow nodes across isolated Git worktrees and Gondolin VMs.

## Development

```bash
npm install
npm run test:run
npm run build
```

Copy `.env.example` to `.env` when running local services.

## Agent platform

The API is served by Koa. Pi resources are factory-owned and read-only inside Gondolin:

```bash
npm run bootstrap:pi-resources
```

The bootstrap installs the pinned Pi Web Access, Ponytail, and Context Mode packages and verifies the Matt Pocock engineering skills under `skills/engineering`. Set `PI_RESOURCE_ROOT` to the mounted resource directory used by the worker.

Each workflow role has an immutable capability profile in `src/agents/role-profiles.ts`. Scout, plan, implement, repair, and review sessions receive different skills, tools, web policy, and Hindsight mental models.

Pi Web Access is configured by `infra/pi/web-search.json.example`; `provider: "all"` preserves provider-labelled results. Credentials are environment-only.

Hindsight uses one bank per organization/project with repository/run/role/phase tags. Missions, directives, and mental models are defined in `infra/hindsight/factory-bank-template.json`. The worker recalls and reflects before each role and retains outcomes afterward.

## Services

Self-hosted service definitions live under `infra/compose`. Temporal remains the workflow authority; Postgres is a projection/reporting store only.
