# Sprint 2 Production Wiring Design

## Goal

Make the Sprint 1 Temporal graph executable end-to-end: GitHub Project items enter Temporal, real Activities run repository work and Pi agents inside Gondolin, immutable artifacts are built inside Gondolin, deployment is digest-pinned with rollback, and Postgres receives durable run projections.

## Scope

Sprint 2 delivers one production worker service with separated Temporal task queues, a real Activity composition root, isolated build/test execution, repository/worktree lifecycle, deployment integration, Postgres projections, asynchronous GitHub reconciliation, and a Compose-backed smoke path.

The worker is the only process that performs side effects. Temporal Workflows contain deterministic sequencing, state, signals, queries, timers, and retry policy. Postgres is a reporting/catalog projection, never a scheduler or lease authority.

## Architecture

The API/webhook process verifies GitHub signatures and reconciles project items asynchronously. A reconciler starts one stable Temporal Workflow per normalized task. The Workflow invokes Activities through task queues:

1. `control` handles workflow-facing coordination and task-status projection.
2. `agent` handles Pi sessions through the official Gondolin extension.
3. `build` handles tests and OCI image builds inside Gondolin.
4. `deploy` handles SSH deployment, health checks, and rollback.

Each Activity receives a correlation envelope containing run ID, task ID, phase, attempt, repository, worktree, and sandbox profile. Activity retries are explicit and classify policy/security errors as non-retryable. Temporal owns retry history, recovery, cancellation, and timers.

### Isolated execution

Repository code is mounted into an official Gondolin VM. Pi sessions, tests, and image builds execute there. The VM has no host Docker socket, host credentials, or broad host mounts. Network access is disabled or restricted to configured source and registry endpoints. The build toolchain is pinned in the configured builder image; the output is an OCI image pushed by digest or exported as an immutable artifact.

The host worker handles only trusted orchestration and artifact metadata. It never executes arbitrary repository commands through the host process provider when the sandbox profile is `gondolin`.

### Artifact and deployment flow

A successful build returns `{ image, digest }`, where `digest` must match an immutable `@sha256:<hex>` reference. Deployment pulls and starts that exact digest over SSH, checks the configured health URL with bounded attempts, and rolls back to the last known-good digest if health fails. A failed rollback is surfaced as a non-retryable deployment failure after the configured recovery attempt.

### Persistence

The canonical run projection stores workflow ID, task ID, status, current node, attempt, timestamps, artifact digest, deployment target, and failure reason. Projection writes are idempotent by `(run_id, event_id)` and may be retried safely. GitHub status updates are derived side effects and never replace Temporal state.

## Components

- `src/temporal/worker-main.ts`: production Worker entrypoint, task-queue registration, and dependency composition.
- `src/temporal/activities/repository.ts`: validated repository preparation and Git worktree lifecycle.
- `src/temporal/activities/gondolin.ts`: VM lifecycle, command execution, artifact transfer, and cleanup.
- `src/temporal/activities/agent.ts`: Pi/Gondolin session execution with role policy and correlation metadata.
- `src/temporal/activities/build.ts`: isolated tests and OCI build/publish with digest validation.
- `src/temporal/activities/deploy.ts`: SSH deployment, health check, rollback, and deployment event projection.
- `src/temporal/activities/projection.ts`: idempotent Postgres run/event/artifact projection.
- `src/temporal/workflows/factory-workflow.ts`: deterministic graph sequencing, status, cancellation, and retry control.
- `src/tasks/reconciler.ts`: GitHub Project item reconciliation and stable Workflow starts.
- `src/api/github-webhook.ts`: signature verification, delivery deduplication, and asynchronous reconciliation trigger.
- `infra/compose/temporal/docker-compose.yml`: self-hosted Temporal dependencies plus worker service configuration.
- `src/db/schema.sql`: run, event, artifact, and deployment projection tables.

## Failure and recovery

- Activity timeout or worker loss: Temporal retries according to the Activity policy.
- Gondolin startup/command failure: cleanup runs in Activity `finally`; retryable VM failures retry without host execution fallback.
- Test/build failure: Workflow invokes the repair agent once, reruns deterministic checks, then fails the run.
- GitHub duplicate webhook: delivery ID is deduplicated before reconciliation.
- Duplicate Workflow start: stable `factory-<run-id>` Workflow ID makes the start idempotent.
- SSH/health failure: deployment retries transient errors, then rolls back to the recorded digest.
- Projection outage: Temporal Activity retries the projection; the Workflow remains the source of truth.
- Cancellation: Temporal cancellation stops pending work and cleanup Activities release worktrees and VMs.

## Testing strategy

1. Unit tests cover activity adapters with fake Gondolin, GitHub, Temporal, SSH, registry, and Postgres clients.
2. Workflow tests verify deterministic node order, repair behavior, cancellation, retry signal handling, and status queries.
3. Security tests prove arbitrary commands never route to the process provider under the Gondolin profile and privileged mounts are rejected.
4. Integration tests use Docker Compose Temporal/Postgres and fake GitHub/registry endpoints to run two repositories concurrently.
5. The smoke test verifies: Project item → Workflow → isolated agent/check/build → digest artifact → deploy/health → Postgres projection → GitHub status.

## Non-goals

- No custom sandbox or microVM implementation.
- No Postgres scheduler, lease loop, or competing execution authority.
- No GitHub repository as the canonical task database.
- No multi-worker autoscaling or production observability platform in this sprint.
- No host Docker socket access for arbitrary project code.

## Acceptance criteria

- A signed GitHub Project event can start a stable Temporal Workflow without doing work in the webhook request.
- Two repository tasks run concurrently with separate worktrees and Gondolin VMs.
- Pi, tests, and builds execute only inside Gondolin.
- The produced image is digest-pinned and deployment rollback is exercised by an unhealthy test deployment.
- Postgres contains idempotent run/event/artifact projections.
- Compose smoke tests pass with Temporal and Postgres enabled.
- Full test suite, TypeScript build, and `git diff --check` pass.
