# Production-Only Software Factory Runtime

## Status
Approved by user for implementation planning.

## Goal
Make the production Temporal/Crabbox/Postgres path the only supported runtime and remove dummy, pass-through, and inert local execution paths.

## Design

Temporal is the execution authority. PostgreSQL stores task/run/node/event projections and does not claim work. Crabbox is the only workspace executor for repository commands, agent sessions, checks, and builds. The Koa API and GitHub Project reconciler submit work to Temporal; neither executes workflow nodes directly.

The execution flow is:

```text
Koa API / GitHub Project reconciler
  -> Temporal workflow
  -> repository preparation and Git worktree
  -> deterministic security gate
  -> scout -> plan -> implement
  -> deterministic checks
  -> bounded repair and re-check
  -> review
  -> immutable image build
  -> digest-pinned deployment
  -> health check and rollback
  -> PostgreSQL projection update
```

## Runtime simplification

Remove these production-facing alternatives:

- `mvpWorkflow` pass-through nodes.
- `InMemoryApplicationStore`.
- `InMemorySchedulerStore` and the local scheduler execution path.
- `ProcessWorkspaceProvider`.
- The identity-only `createFactoryActivities` wrapper.
- API behavior that reports retry success without scheduling a retry.

Test doubles remain under `tests/` where they isolate unit tests, but no test implementation is selected by the application entrypoint.

## Workflow behavior

The Temporal workflow owns the ordered stages and records completion through activity projections. Repository preparation and worktree creation use the existing repository/worktree adapters. Security scanning is a deterministic activity using `securityGate`; command execution uses the isolated Crabbox provider. Agent activities use the role profiles and Pi runner inside the isolated workspace.

Checks run through Crabbox. A failed check permits one repair activity followed by one re-check; a second failure fails the workflow. The workflow runs review, builds an immutable digest-pinned artifact, deploys it, then performs an explicit health check. Failed health checks roll back only when a valid previous digest exists.

Retry requests must have defined behavior. A supported retry restarts the workflow from the requested stage using persisted input and projection state. Unsupported or completed stages return an explicit error rather than a false success response.

## Composition and startup

The application composition root constructs the API, PostgreSQL projection/store, GitHub task provider where configured, Temporal client, and production workers from environment configuration. Startup validates required dependencies and fails closed when Crabbox, Temporal, PostgreSQL, Hindsight, Pi resources, or deployment configuration required for the selected mode are unavailable.

The API creates a task record and starts a Temporal workflow with an idempotent workflow ID. GitHub reconciliation starts the same workflow contract and updates source status only after a successful start. Temporal activities update PostgreSQL projections; PostgreSQL is not used to run nodes.

Shutdown closes HTTP, PostgreSQL, Temporal, and worker resources where the underlying adapter exposes lifecycle control.

## Error and safety rules

- No arbitrary repository command executes through the host process provider.
- Shell execution remains disabled and command arguments remain arrays.
- Security and policy failures are non-retryable workflow errors.
- Artifact and rollback image references must be full SHA-256 digests.
- Deployment health failure rolls back when possible and reports failure when not.
- Duplicate API/GitHub delivery/workflow starts are idempotent.
- Projection writes remain separate from task claiming and orchestration.

## Verification

Tests must prove:

- no application path constructs the process provider or in-memory runtime;
- task creation starts an idempotent Temporal workflow;
- security and command gates are invoked by workflow activities;
- checks, repair, build, deploy, health check, and rollback compose correctly;
- retry requests do not silently succeed without work;
- production startup rejects missing required dependencies;
- duplicate workflow/delivery inputs are safe;
- the full TypeScript build and test suite pass.

The implementation should delete code and tests that only validate removed runtime paths rather than preserving compatibility shims.
