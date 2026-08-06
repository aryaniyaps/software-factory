# Production-Only Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Temporal + PostgreSQL + Crabbox the only application runtime, wire every workflow stage to real activities, and remove inert in-memory/process/MVP execution paths.

**Architecture:** The API and GitHub reconciler submit idempotent Temporal workflows. Temporal owns orchestration and retries. Activities own repository/worktree, security, agent, check, build, deploy, and projection side effects. PostgreSQL is a projection/store, never a scheduler. Crabbox is the only command/workspace executor.

**Tech Stack:** TypeScript, Node 24, Koa, Temporal SDK, PostgreSQL/`pg`, Crabbox, Pi/Gondolin, Vitest.

## Global Constraints

- No production code may construct or select `ProcessWorkspaceProvider`, `InMemoryApplicationStore`, or `InMemorySchedulerStore`.
- No arbitrary command may use a shell or host-process execution path.
- Every new behavior gets a failing Vitest test before implementation.
- PostgreSQL projection writes must not claim or execute work.
- Workflow IDs and GitHub delivery handling must be idempotent.
- Artifact and rollback images require full `name@sha256:<64 hex>` digests.
- Keep test fakes in tests; do not preserve compatibility shims for deleted runtime paths.

---

### Task 1: Define the production composition contract

**Files:**
- Modify: `src/api/server.ts`
- Create: `src/api/production-api.ts`
- Modify: `src/temporal/application.ts`
- Modify: `src/temporal/client.ts`
- Test: `tests/api/server.test.ts`
- Test: `tests/temporal/application.test.ts`
- Test: `tests/temporal/client.test.ts`

**Interfaces:**
- `ApiStore.createTask()` returns a persisted task/run ID only after the Temporal start request succeeds or an idempotent existing workflow is recognized.
- `WorkflowClientLike.workflow.start()` receives the canonical workflow name, deterministic workflow ID, task queue, and `FactoryWorkflowInput`.
- Production composition exposes `reconcile`, `startWorkers`, `close`, and API shutdown without no-op lifecycle methods.

- [ ] **Step 1: Write failing tests**

Add tests proving:

```ts
it("starts one Temporal workflow when the API creates a task", async () => {
  const starts: unknown[] = [];
  const client = { workflow: { start: async (...args: unknown[]) => { starts.push(args); return {}; } } };
  const api = createProductionApi({ store: storeThatCreatesTask("task-1"), workflowClient: client });
  await api.createTask({ repository: "https://github.com/acme/app.git", title: "Fix", description: "Do it" });
  expect(starts).toHaveLength(1);
});

it("uses a stable workflow ID for duplicate task creation", async () => {
  const ids: string[] = [];
  const client = { workflow: { start: async (name: string, options: { workflowId: string }) => { ids.push(options.workflowId); return {}; } } };
  const api = createProductionApi({ store: storeThatCreatesTask("task-1"), workflowClient: client });
  await api.createTask(input);
  await api.createTask(input);
  expect(new Set(ids).size).toBe(1);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run tests/api/server.test.ts tests/temporal/application.test.ts tests/temporal/client.test.ts`

Expected: FAIL because the production API composition and idempotent workflow-start contract do not exist.

- [ ] **Step 3: Implement the minimal production composition**

Add one production API adapter that validates the task, persists the task through the configured store, constructs `FactoryWorkflowInput`, and starts `factoryWorkflow` with `workflowId: factory-${taskId}`. Treat Temporal’s already-started error as success only when the workflow ID matches the requested task.

Make `createProductionApplication()` require an explicit `close()` dependency or closeable resources and return a real shutdown function. Do not add an in-memory fallback.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --run tests/api/server.test.ts tests/temporal/application.test.ts tests/temporal/client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api src/temporal tests/api tests/temporal
git commit -m "feat: start production workflows from the application"
```

---

### Task 2: Replace pass-through workflow stages with real activities

**Files:**
- Delete: `src/workflow/mvp-workflow.ts`
- Delete: `src/workflow/node.ts` if no production caller remains
- Modify: `src/temporal/activities/types.ts`
- Modify: `src/temporal/activities/repository.ts`
- Modify: `src/temporal/workflows/factory-workflow.ts`
- Test: `tests/temporal/factory-workflow.test.ts`
- Test: `tests/temporal/repository-activities.test.ts`

**Interfaces:**
- Add `securityScan(input): Promise<{ passed: boolean; findings: string[] }>` to the activity contract.
- Add `healthCheck(input): Promise<{ healthy: boolean; url: string }>` to the activity contract.
- Repository preparation returns `{ repository, revision }`; worktree creation returns `{ path, branch }`.
- The workflow records actual stage names, not placeholder graph node names.

- [ ] **Step 1: Write failing workflow tests**

Cover:

```ts
it("runs security scan before agents", async () => {
  const calls: string[] = [];
  const activities = fakeActivities({
    securityScan: async () => { calls.push("security"); return { passed: true, findings: [] }; },
    runAgent: async ({ role }) => { calls.push(role); return { sessionId: role, output: role }; },
  });
  await runFactoryWorkflowWithActivities(activities, input);
  expect(calls.indexOf("security")).toBeLessThan(calls.indexOf("scout"));
});

it("runs one repair and one re-check after failed checks", async () => {
  const checks = [{ passed: false, output: "fail" }, { passed: true, output: "ok" }];
  const result = await runFactoryWorkflowWithActivities(fakeActivities({ checks }), input);
  expect(result.completedNodes).toContain("repair");
});

it("fails security violations without running agents", async () => {
  await expect(runFactoryWorkflowWithActivities(fakeActivities({ security: { passed: false, findings: [".env"] } }), input)).rejects.toThrow();
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run tests/temporal/factory-workflow.test.ts tests/temporal/repository-activities.test.ts`

Expected: FAIL because the workflow does not call security or health activities and still reflects the old MVP shape.

- [ ] **Step 3: Implement real workflow sequencing**

Rewrite `factoryWorkflow()` to call repository preparation, worktree creation, security scan, scout, plan, implement, checks, bounded repair/re-check, review, artifact build, deployment, explicit health check, and final status projection. Use activity errors for policy/security failures and preserve the existing Temporal retry policy.

Remove the local `WorkflowNode`/`mvpWorkflow` execution model rather than adding an adapter around it.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --run tests/temporal/factory-workflow.test.ts tests/temporal/repository-activities.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/temporal src/workflow tests/temporal
git commit -m "feat: execute real factory workflow stages"
```

---

### Task 3: Wire gates and isolated command execution

**Files:**
- Modify: `src/gates/command-gate.ts`
- Modify: `src/gates/security-gate.ts`
- Modify: `src/temporal/activities/production.ts`
- Modify: `src/temporal/activities/build.ts`
- Modify: `src/temporal/activities/types.ts`
- Test: `tests/gates/command-gate.test.ts`
- Test: `tests/gates/security-gate.test.ts`
- Test: `tests/temporal/production-activities.test.ts`
- Test: `tests/temporal/build-activities.test.ts`

**Interfaces:**
- Security scans receive the repository file list and return findings.
- Build/check activities execute only through injected `WorkspaceProvider`/Crabbox runtime.
- Command results preserve exit code, stdout, stderr, timeout, and output limits.

- [ ] **Step 1: Write failing integration tests**

Assert that production activities invoke the gates, reject credential findings, execute commands through the injected workspace, and close/destroy the workspace on success and failure.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/gates tests/temporal/production-activities.test.ts tests/temporal/build-activities.test.ts`

Expected: FAIL because the production activity registry does not expose security/health behavior and the gate functions are not part of the activity path.

- [ ] **Step 3: Implement the minimum wiring**

Use `securityGate()` as the deterministic filename preflight. Keep command execution shell-free and route repository commands, tests, and builds through Crabbox. Remove any host-process provider from production dependencies.

- [ ] **Step 4: Run focused tests and verify they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gates src/temporal/activities tests/gates tests/temporal
git commit -m "feat: enforce security and isolated command gates"
```

---

### Task 4: Make deployment and health-check stages explicit

**Files:**
- Modify: `src/temporal/activities/deploy.ts`
- Modify: `src/temporal/activities/production.ts`
- Modify: `src/temporal/production-worker.ts`
- Modify: `src/temporal/workflows/factory-workflow.ts`
- Test: `tests/temporal/deploy-activities.test.ts`
- Test: `tests/deploy/docker-deployer.test.ts`

**Interfaces:**
- Deployment returns deployment state without pretending health succeeded.
- `healthCheck()` uses `HealthChecker` and returns an explicit result.
- Rollback is attempted only with a valid previous digest and its result is reported.

- [ ] **Step 1: Write failing tests**

Cover healthy deployment, unhealthy deployment with rollback, missing previous digest, rollback failure, and the workflow’s explicit health-check call.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/temporal/deploy-activities.test.ts tests/deploy/docker-deployer.test.ts tests/temporal/factory-workflow.test.ts`

Expected: FAIL because health is currently folded into deployment and the workflow marks it complete without an activity.

- [ ] **Step 3: Implement deployment/health separation**

Keep digest validation in one helper. Deploy the new digest, run health separately, roll back when configured, and propagate a failed health result to Temporal as a failed node.

- [ ] **Step 4: Run focused tests and verify they pass**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/deploy src/temporal tests/deploy tests/temporal
git commit -m "feat: make deployment health and rollback explicit"
```

---

### Task 5: Remove inert local runtime and wire PostgreSQL projection to Temporal

**Files:**
- Delete: `src/container.ts`
- Delete: `src/scheduler/scheduler.ts`
- Delete: `src/workspaces/process-provider.ts`
- Modify: `src/db/application-store.ts`
- Modify: `src/db/factory-projection.ts`
- Modify: `src/api/server.ts`
- Modify: `src/server.ts`
- Test: `tests/db/*`
- Test: `tests/scheduler/*` (delete if only local scheduler behavior)
- Test: `tests/workspaces/process-provider.test.ts` (delete)
- Test: `tests/temporal/application.test.ts`

**Interfaces:**
- The API composition receives a PostgreSQL pool and Temporal workflow client.
- PostgreSQL stores tasks, runs, nodes, events, artifacts, and deployment state.
- No PostgreSQL method starts or claims a node.

- [ ] **Step 1: Write failing composition tests**

Assert that production task creation persists a task and starts Temporal, that no scheduler is created, and that the app refuses startup without required production dependencies.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/db tests/temporal/application.test.ts tests/api/server.test.ts`

Expected: FAIL because the current composition is built around the in-memory application and does not start workflows.

- [ ] **Step 3: Replace composition with production-only wiring**

Construct the API from PostgreSQL + Temporal dependencies. Remove the in-memory application, local scheduler, process provider, and MVP graph. Update `src/server.ts` to use the production composition and fail closed when required environment variables are absent.

- [ ] **Step 4: Delete obsolete tests and update remaining tests**

Delete tests whose only purpose was to preserve removed runtime paths. Keep unit tests for PostgreSQL behavior and production composition.

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `npm test -- --run tests/db tests/temporal/application.test.ts tests/api/server.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests/db tests/api tests/temporal tests/workspaces tests/scheduler
git commit -m "refactor: remove inert local runtime"
```

---

### Task 6: Implement real retry and idempotent source reconciliation

**Files:**
- Modify: `src/api/server.ts`
- Modify: `src/api/github-webhook.ts`
- Modify: `src/tasks/reconciler.ts`
- Modify: `src/temporal/workflows/factory-workflow.ts`
- Modify: `src/db/application-store.ts`
- Test: `tests/api/server.test.ts`
- Test: `tests/api/github-webhook-dedup.test.ts`
- Test: `tests/tasks/reconciler.test.ts`
- Test: `tests/temporal/factory-workflow.test.ts`

**Interfaces:**
- Retry accepts a node/stage ID and returns either a newly requested retry or an explicit unsupported-stage error.
- Reconciler starts one workflow per source task and updates source state only after start success.
- Duplicate webhook deliveries and duplicate workflow IDs are safe.

- [ ] **Step 1: Write failing tests**

Cover successful retry request, unsupported/completed retry rejection, duplicate delivery, duplicate workflow start, and status update ordering.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/api/server.test.ts tests/api/github-webhook-dedup.test.ts tests/tasks/reconciler.test.ts tests/temporal/factory-workflow.test.ts`

Expected: FAIL because local retry is a no-op and workflow retry signals do not restart work.

- [ ] **Step 3: Implement retry and idempotency**

Persist the workflow input and stage state needed to restart a supported stage. Reject stages that cannot safely restart. Use stable workflow IDs and preserve delivery IDs durably rather than only in an in-memory `Set`.

- [ ] **Step 4: Run focused tests and verify they pass**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api src/tasks src/db src/temporal tests/api tests/tasks tests/temporal
git commit -m "feat: make retries and source reconciliation real"
```

---

### Task 7: Make startup and shutdown fail closed

**Files:**
- Modify: `src/temporal/production-worker.ts`
- Modify: `src/temporal/application.ts`
- Modify: `src/temporal/worker-entry.ts`
- Modify: `src/server.ts`
- Modify: `.env.example`
- Test: `tests/temporal/production-worker.test.ts`
- Test: `tests/temporal/application.test.ts`

**Interfaces:**
- Startup validates Temporal, PostgreSQL, Crabbox, Hindsight, Pi resources, and deployment configuration before accepting tasks.
- Shutdown closes HTTP, pool, Temporal client, and workers through explicit lifecycle functions.

- [ ] **Step 1: Write failing startup tests**

Cover each missing required dependency and assert the error names the missing configuration. Add a shutdown test asserting all closeable resources are closed once.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/temporal/production-worker.test.ts tests/temporal/application.test.ts`

Expected: FAIL because lifecycle close is empty and some configuration is only discovered during execution.

- [ ] **Step 3: Implement validation and cleanup**

Validate configuration before worker creation. Keep `assertCrabboxAvailable()` as the worker startup guard. Return close functions from adapters that own resources and invoke them in reverse composition order.

- [ ] **Step 4: Run focused tests and verify they pass**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/temporal src/server.ts .env.example tests/temporal
git commit -m "feat: fail closed and shut down production resources"
```

---

### Task 8: Remove stale documentation/configuration and verify the production path

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `infra/compose/docker-compose.yml`
- Modify: `infra/compose/temporal/docker-compose.yml`
- Delete: obsolete MVP plans/specs only if they describe removed behavior
- Test: `tests/e2e/production-loop.test.ts`

- [ ] **Step 1: Write the production smoke test first**

The test must submit two tasks through the production composition, assert distinct workflow IDs/worktrees, verify projection updates, and verify failed health causes rollback. It must use the configured test infrastructure adapters, not the removed process/in-memory application path.

- [ ] **Step 2: Run the smoke test and verify it fails**

Run: `npm test -- --run tests/e2e/production-loop.test.ts`

Expected: FAIL until the full composition is connected.

- [ ] **Step 3: Update operational configuration and documentation**

Document one startup path, required environment variables, Temporal worker startup, Crabbox requirement, PostgreSQL projection role, and deployment/rollback configuration. Remove scripts and dependencies that only support deleted local execution.

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
npm run test:run
npm run build
git diff --check
git grep -n "mvpWorkflow\|InMemoryApplicationStore\|InMemorySchedulerStore\|ProcessWorkspaceProvider" -- src packages || true
```

Expected: all tests/build pass and the final grep returns no production references.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json infra tests/e2e docs
 git commit -m "docs: document production-only factory runtime"
```
