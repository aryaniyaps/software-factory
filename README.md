# Software Factory

A code-defined, graph-oriented software factory. Temporal coordinates deterministic and Pi-backed workflow nodes across isolated Git worktrees and Crabbox leases.

## Development

Repository tests, scans, and builds run through Crabbox local-container leases. Install the `crabbox` CLI and Docker or Podman on the worker host. Crabbox syncs the worktree into the lease; commands that intentionally modify files must explicitly copy those files back before the lease is stopped. The worker never runs arbitrary repository commands directly on the host.

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

The bootstrap installs the pinned Pi Web Access, Ponytail, Context Mode, and `@tintinweb/pi-subagents` packages and verifies the Matt Pocock engineering skills under `src/agents/skills/engineering`. Set `PI_RESOURCE_ROOT` to the mounted resource directory used by the worker.

Inside a Pi session, use `Agent` to spawn a foreground or background subagent. Use `get_subagent_result` to collect background results and `steer_subagent` to redirect a running agent. Custom agent definitions can live under `.pi/agents/` when a project needs them.

Each workflow role has an immutable capability profile in `src/agents/role-profiles.ts`. Scout, plan, implement, repair, and review sessions receive different skills, tools, web policy, and Hindsight mental models.

Pi Web Access is configured by `infra/pi/web-search.json.example`; `provider: "all"` preserves provider-labelled results. Credentials are environment-only.

Hindsight uses one bank per organization/project with repository/run/role/phase tags. Missions, directives, and mental models are defined in `infra/hindsight/factory-bank-template.json`. The worker recalls and reflects before each role and retains outcomes afterward.

## Services

Self-hosted service definitions live under `infra/compose`. Temporal remains the workflow authority; Postgres is a projection/reporting store only.
