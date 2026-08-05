# Sprint 2 Production Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Temporal factory graph execute real isolated repository, agent, test, build, deployment, and Postgres projection Activities end-to-end.

**Architecture:** Temporal Workflows own deterministic sequencing and retry policy. Activities are registered on separate control, agent, build, and deploy task queues; all arbitrary repository commands run through the official Gondolin workspace provider. GitHub Projects starts stable Workflows asynchronously, while Postgres stores idempotent projections only.

**Tech Stack:** TypeScript, Temporal TypeScript SDK, official Pi Gondolin extension, `@earendil-works/gondolin`, PostgreSQL via `pg`, Git worktrees, SSH, Docker/OCI builder inside Gondolin, Vitest, Docker Compose.

## Global Constraints

- Temporal is the execution authority; do not add or restore a Postgres scheduler or lease loop.
- Arbitrary repository code must not execute through the host process provider.
- Do not mount the host Docker socket or host credentials into Gondolin.
- Deployment accepts only immutable `image@sha256:<hex>` references.
- Workflow code must remain deterministic; filesystem, network, Git, Pi, Postgres, and deployment calls are Activities.
- Use existing interfaces and installed dependencies before adding new dependencies.
- Every non-trivial behavior gets a focused test and every task ends with a commit.

---

### Task 1: Route the graph through separated Temporal task queues

**Files:**
- Modify: `src/temporal/task-queues.ts`
- Modify: `src/temporal/client.ts`
- Modify: `src/temporal/worker.ts`
- Modify: `src/temporal/workflows/factory-workflow.ts`
- Modify: `src/temporal/activities/types.ts`
- Create: `tests/temporal/task-queues.test.ts`
- Modify: `tests/temporal/factory-workflow.test.ts`

**Interfaces:**
- Produce `TASK_QUEUES = { control, agent, build, deploy }`.
- Produce `createTemporalWorker({ taskQueue, workflowsPath, activities, ... })` that can register one queue at a time.
- Workflow Activities use `proxyActivities` with `taskQueue: TASK_QUEUES.agent`, `TASK_QUEUES.build`, and `TASK_QUEUES.deploy` rather than routing every side effect through the control queue.

- [ ] **Step 1: Write failing routing tests.** Assert the four queue names are stable and that the workflow module declares activity proxies for agent, build, and deploy queues.
- [ ] **Step 2: Run the focused tests.** Run `npm test -- --run tests/temporal/task-queues.test.ts tests/temporal/factory-workflow.test.ts`. Expected: failure because queue constants/proxies are absent.
- [ ] **Step 3: Implement the smallest routing change.** Add the constants, set each proxy’s `taskQueue`, and keep retry/timeout options in one shared helper so policy stays identical across queues.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/temporal/task-queues.test.ts tests/temporal/factory-workflow.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/temporal tests/temporal && git commit -m "feat: route factory activities across temporal queues"`

---

### Task 2: Implement validated repository preparation and worktree cleanup

**Files:**
- Create: `src/temporal/activities/repository.ts`
- Modify: `src/temporal/activities/types.ts`
- Modify: `src/workspaces/worktree-manager.ts`
- Create: `tests/temporal/repository-activities.test.ts`
- Modify: `tests/workspaces/worktree-manager.test.ts`

**Interfaces:**
- `createRepositoryActivities({ git, worktrees, repositoryRoot })` returns `prepareRepository` and `createWorktree` Activity functions.
- `prepareRepository(input)` accepts only configured local repository paths or HTTPS Git URLs, returns `{ repository, revision }`, and rejects unsupported schemes.
- `createWorktree(input)` returns `{ path, branch }` using `factory/<runId>/<taskId>/<attemptId>` and registers cleanup metadata.
- `removeWorktree(input)` is idempotent and is called from Workflow cleanup/failure paths.

- [ ] **Step 1: Write failing tests.** Cover HTTPS/local allowlisted repositories, rejection of `ssh://`, `file://`, shell metacharacters, separate paths for two concurrent tasks, and repeated cleanup.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/temporal/repository-activities.test.ts tests/workspaces/worktree-manager.test.ts`. Expected: failure for the new Activity module and missing cleanup behavior.
- [ ] **Step 3: Implement repository Activities.** Use `execFile("git", args)` only; never compose a shell command. Capture `git rev-parse HEAD`, create worktrees with existing `GitWorktreeManager`, and make cleanup safe when the first attempt already removed the path.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/temporal/repository-activities.test.ts tests/workspaces/worktree-manager.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/temporal/activities src/workspaces tests && git commit -m "feat: add repository and worktree activities"`

---

### Task 3: Implement Gondolin VM lifecycle and Pi Activities

**Files:**
- Create: `src/temporal/activities/gondolin.ts`
- Create: `src/temporal/activities/agent.ts`
- Modify: `src/agents/gondolin-session.ts`
- Modify: `src/workspaces/gondolin-provider.ts`
- Modify: `src/temporal/activities/types.ts`
- Create: `tests/temporal/gondolin-activities.test.ts`
- Create: `tests/temporal/agent-activities.test.ts`

**Interfaces:**
- `GondolinActivityRuntime.createForWorktree({ path, sandboxProfile, network })` returns `{ workspaceId, exec, close }`.
- `runAgent(input)` invokes `PiAgentRunner` with the worktree path, role policy, and correlation metadata, then returns `{ sessionId, output }`.
- Gondolin cleanup runs in `finally` and never falls back to `ProcessWorkspaceProvider` when `sandboxProfile === "gondolin"`.

- [ ] **Step 1: Write failing adapter tests.** Use fake VM/session adapters to assert creation, command/session execution, close-on-success, close-on-error, restricted network, and rejection of privileged profiles.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/temporal/gondolin-activities.test.ts tests/temporal/agent-activities.test.ts`. Expected: failure because Activity factories do not exist.
- [ ] **Step 3: Implement lifecycle and agent adapters.** Reuse the official Pi Gondolin extension and existing role tool policy. Pass only workspace paths and correlation IDs into sessions; do not expose host process tools to arbitrary code.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/temporal/gondolin-activities.test.ts tests/temporal/agent-activities.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/agents src/workspaces src/temporal/activities tests/temporal && git commit -m "feat: run pi activities through gondolin"`

---

### Task 4: Build and publish immutable artifacts inside Gondolin

**Files:**
- Create: `src/temporal/activities/build.ts`
- Modify: `src/temporal/activities/production.ts`
- Modify: `src/temporal/activities/types.ts`
- Create: `tests/temporal/build-activities.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- `runChecks(input)` executes the configured project test command inside the active Gondolin VM and returns `{ passed, output }` with bounded output.
- `buildArtifact(input)` runs the pinned builder inside Gondolin, pushes or exports the OCI artifact, verifies `image@sha256:<hex>`, and returns `{ image, digest }`.
- `ArtifactBuilder` receives no host Docker socket and no arbitrary host mount; registry credentials are injected only through an in-VM secret mechanism.

- [ ] **Step 1: Write failing tests.** Cover successful checks, failed checks, builder failure, invalid mutable image tags, digest mismatch, output limits, and cleanup after a failed build.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/temporal/build-activities.test.ts`. Expected: failure because isolated build Activities are absent.
- [ ] **Step 3: Implement the builder adapter.** Execute the configured pinned builder command through `WorkspaceProvider.exec`; validate the digest with `/^[^@]+@sha256:[a-f0-9]{64}$/`; return no mutable tag. Keep builder configuration in environment/profile data, not Workflow code.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/temporal/build-activities.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/temporal/activities .env.example README.md tests/temporal && git commit -m "feat: build immutable artifacts inside gondolin"`

---

### Task 5: Implement deployment Activity and rollback projection events

**Files:**
- Create: `src/temporal/activities/deploy.ts`
- Modify: `src/deploy/docker-vps.ts`
- Modify: `src/deploy/health-checker.ts`
- Modify: `src/temporal/activities/types.ts`
- Create: `tests/temporal/deploy-activities.test.ts`
- Modify: `tests/deploy/docker-deployer.test.ts`

**Interfaces:**
- `deploy(input)` accepts only a validated digest and deployment profile, executes fixed SSH argv through `SshExecutor`, checks health, and returns `{ deployed, healthUrl }`.
- A failed health check starts the recorded previous digest; if no previous digest exists, it fails without attempting an unsafe fallback.
- Deployment events include `started`, `healthy`, `rollback_started`, `rollback_succeeded`, or `rollback_failed` and carry the run correlation envelope.

- [ ] **Step 1: Write failing tests.** Cover digest validation, fixed SSH argv, healthy deployment, unhealthy deployment with rollback, missing previous digest, and rollback failure classification.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/temporal/deploy-activities.test.ts tests/deploy/docker-deployer.test.ts`. Expected: failure for the production Activity adapter.
- [ ] **Step 3: Implement deployment.** Reuse `SshExecutor` and `HealthChecker`; keep command arguments arrays, use bounded timeouts, and preserve the previous digest in the deployment profile.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/temporal/deploy-activities.test.ts tests/deploy/docker-deployer.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/deploy src/temporal/activities tests && git commit -m "feat: deploy digest-pinned artifacts with rollback"`

---

### Task 6: Add idempotent Postgres run/event/artifact projections

**Files:**
- Modify: `src/db/schema.sql`
- Create: `src/db/factory-projection.ts`
- Modify: `src/db/database.ts`
- Create: `tests/db/factory-projection.test.ts`
- Modify: `src/temporal/activities/types.ts`

**Interfaces:**
- Tables store `factory_runs`, `factory_events`, `factory_artifacts`, and `factory_deployments`; `factory_events` has a unique `(run_id, event_id)` constraint.
- `FactoryProjection.recordRun`, `recordEvent`, `recordArtifact`, and `recordDeployment` use parameterized SQL and `ON CONFLICT` idempotency.
- Projection methods accept correlation envelopes and are safe to retry after a partial commit.

- [ ] **Step 1: Write failing database tests.** Assert schema creation, run upsert, duplicate event no-op, artifact digest persistence, deployment rollback status, and parameterized values.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/db/factory-projection.test.ts`. Expected: failure because the schema and projection adapter are absent.
- [ ] **Step 3: Implement schema and adapter.** Add constraints and indexes for workflow ID, task ID, event identity, and digest. Use one transaction per multi-row projection update and never use the projection for task claiming.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/db/factory-projection.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/db src/temporal/activities tests/db && git commit -m "feat: persist idempotent factory projections"`

---

### Task 7: Add the production worker composition root and async reconciliation

**Files:**
- Create: `src/temporal/worker-main.ts`
- Create: `src/temporal/application.ts`
- Modify: `src/temporal/worker.ts`
- Modify: `src/tasks/reconciler.ts`
- Modify: `src/api/github-webhook.ts`
- Modify: `package.json`
- Create: `tests/temporal/worker-main.test.ts`
- Create: `tests/api/github-webhook-dedup.test.ts`

**Interfaces:**
- `createProductionApplication(config)` returns `{ activities, reconciler, startWorkers, close }`.
- `startWorkers()` registers the same Activity bundle on control, agent, build, and deploy queues and loads the compiled Workflow bundle.
- Webhook handling returns `202` before reconciliation, deduplicates `x-github-delivery`, and invokes `ProjectReconciler` outside the request path.
- `package.json` exposes `worker` and `reconcile` commands that run the composition root without host-side arbitrary-code fallback.

- [ ] **Step 1: Write failing composition tests.** Assert all four queues are registered, dependencies share the configured Postgres/GitHub/registry profiles, webhook delivery IDs run once, and duplicate Workflow IDs are ignored safely.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/temporal/worker-main.test.ts tests/api/github-webhook-dedup.test.ts`. Expected: failure because no production composition root exists.
- [ ] **Step 3: Implement composition.** Construct repository, Gondolin, Pi, build, deployment, projection, GitHub, and Temporal adapters from environment/profile configuration. Keep startup/shutdown explicit and close DB/Temporal/VM resources on termination.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/temporal/worker-main.test.ts tests/api/github-webhook-dedup.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/temporal src/tasks src/api package.json tests && git commit -m "feat: add production worker composition"`

---

### Task 8: Add Compose smoke coverage for two concurrent projects

**Files:**
- Modify: `infra/compose/temporal/docker-compose.yml`
- Modify: `infra/compose/docker-compose.yml`
- Create: `tests/e2e/production-loop.test.ts`
- Create: `tests/e2e/helpers/temporal-harness.ts`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- The harness starts Temporal, PostgreSQL, and the production worker with deterministic test profiles.
- The test submits two ready items from different repositories, waits for both stable Workflow IDs, and verifies separate worktrees/VMs and two projection rows.
- A fake registry/deployment target forces one unhealthy deployment and verifies digest rollback without contacting a real VPS.

- [ ] **Step 1: Write the failing smoke test and harness contract.** Define the two task fixtures, expected Workflow IDs, projection assertions, and rollback assertion.
- [ ] **Step 2: Run the smoke test against the Compose profile.** Run `npm test -- --run tests/e2e/production-loop.test.ts`. Expected: failure until worker entrypoint and services are wired.
- [ ] **Step 3: Add Compose services/configuration.** Add the worker command, required Temporal/Postgres environment, health dependencies, test registry target, and no host Docker socket/mounts.
- [ ] **Step 4: Implement harness polling.** Poll Temporal Workflow status and Postgres projections with bounded deadlines; print only failure details on timeout.
- [ ] **Step 5: Run the smoke test and full verification.** Run `npm test -- --run tests/e2e/production-loop.test.ts`, `npm run test:run`, `npm run build`, and `git diff --check`.
- [ ] **Step 6: Commit.** `git add infra tests/e2e README.md .env.example && git commit -m "test: verify concurrent production loops"`

---

## Final review checklist

- [ ] Every Activity has a retry/timeout policy and correlation envelope.
- [ ] No arbitrary command path uses `ProcessWorkspaceProvider` under the Gondolin profile.
- [ ] No Docker socket, broad host mount, or host credential enters Gondolin.
- [ ] Every deployment image and rollback image is digest-pinned.
- [ ] Postgres projection writes are idempotent and never claim work.
- [ ] Duplicate GitHub deliveries and duplicate Temporal starts are safe.
- [ ] Two repositories execute concurrently with distinct worktrees and VMs.
- [ ] `npm run test:run`, `npm run build`, and `git diff --check` pass.
