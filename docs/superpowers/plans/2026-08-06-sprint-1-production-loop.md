# Sprint 1 Production Execution Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom scheduler with self-hosted Temporal, run Pi phases through the official Gondolin integration, consume organization GitHub Projects v2 across repositories, and deploy immutable Docker images over SSH with rollback.

**Architecture:** Temporal Workflows own graph topology, durable history, retries, signals, cancellation, and fan-out/fan-in. Activities own all side effects: Git worktrees, Gondolin VMs, Pi sessions, tests, GitHub API calls, artifacts, and deployment. Postgres remains a factory catalog/reporting projection, not a scheduler.

**Tech Stack:** Node.js 24, TypeScript, `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@earendil-works/gondolin`, Pi SDK, PostgreSQL, native `fetch`, native `node:child_process`, GitHub GraphQL, Docker over SSH, Vitest.

## Global Constraints

- Workflow code must be deterministic and contain no direct filesystem, network, process, random, or wall-clock calls.
- All side effects run in Activities with explicit timeouts and retry policies.
- Do not implement a custom scheduler, lease protocol, VM, hypervisor, container runtime, or network policy engine.
- Use the official Pi Gondolin extension/SDK and pin its version.
- No process workspace provider when `ARBITRARY_CODE=true`.
- GitHub Projects v2 is the task surface; GitHub repositories are repository adapters.
- All external commands use executable plus argument arrays.
- Activity outputs and task metadata carry factory/run/ticket/phase/worktree correlation IDs.

---

### Task 1: Add Temporal service and TypeScript SDK

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/temporal/client.ts`
- Create: `src/temporal/worker.ts`
- Create: `src/temporal/task-queues.ts`
- Create: `infra/compose/temporal/docker-compose.yml`
- Create: `tests/temporal/client.test.ts`

**Interfaces:**

```ts
export const TASK_QUEUES = {
  control: "factory-control",
  agent: "factory-agent",
  sandbox: "factory-sandbox",
  deploy: "factory-deploy",
} as const;

export interface FactoryWorkflowInput {
  runId: string;
  taskId: string;
  repository: string;
  baseBranch: string;
  workflow: string;
  deploymentProfile: string;
  sandboxProfile: string;
}
```

- [ ] **Step 1: Write the failing client test**

Test that `createTemporalClient` connects using environment configuration and that `startFactoryWorkflow` uses a stable workflow ID derived from the factory run ID and the configured control task queue.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/temporal/client.test.ts`.
Expected: FAIL because Temporal modules are absent.

- [ ] **Step 3: Install the SDK and configure self-hosted Temporal**

Add the three Temporal TypeScript packages at one pinned version. Add the official Postgres-backed Temporal Compose configuration under `infra/compose/temporal` without rewriting Temporal service components. Keep Temporal's persistence database separate from the factory catalog database.

- [ ] **Step 4: Implement client and task queue constants**

Use `NativeConnection.connect` and `Client`. Do not construct clients in Workflow code. Expose `startFactoryWorkflow`, `signalFactoryWorkflow`, and `cancelFactoryWorkflow` from the client module.

- [ ] **Step 5: Implement worker bootstrap**

Create a worker bootstrap that registers Workflow code and Activities by task queue. It must close the connection on shutdown and return non-zero on startup/configuration failure.

- [ ] **Step 6: Run tests and build**

Run: `npm test -- --run tests/temporal/client.test.ts && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/temporal infra/compose/temporal tests/temporal
git commit -m "feat: add self-hosted temporal runtime"
```

---

### Task 2: Move graph execution into a durable Temporal Workflow

**Files:**
- Create: `src/temporal/workflows/factory-workflow.ts`
- Create: `src/temporal/workflows/types.ts`
- Create: `src/temporal/activities/types.ts`
- Create: `src/temporal/activities/factory-activities.ts`
- Create: `tests/temporal/factory-workflow.test.ts`

**Interfaces:**

```ts
export interface FactoryWorkflowState {
  runId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  completedNodes: string[];
  failedNode?: string;
}

export interface FactoryActivities {
  prepareRepository(input: FactoryWorkflowInput): Promise<RepositoryPreparation>;
  createWorktree(input: WorktreeInput): Promise<WorktreeResult>;
  runAgent(input: AgentActivityInput): Promise<AgentActivityResult>;
  runChecks(input: ChecksInput): Promise<ChecksResult>;
  buildArtifact(input: BuildInput): Promise<ArtifactResult>;
  deploy(input: DeployInput): Promise<DeployResult>;
  updateTaskStatus(input: TaskStatusInput): Promise<void>;
}
```

- [ ] **Step 1: Write Workflow tests with mocked Activities**

Cover sequential phase ordering, parallel independent child Workflows, Activity retry policy configuration, successful completion, non-retryable policy failure, cancellation Signal, retry Signal, and Query status.

- [ ] **Step 2: Run Workflow tests and verify they fail**

Run: `npm test -- --run tests/temporal/factory-workflow.test.ts`.
Expected: FAIL because Workflow code is absent.

- [ ] **Step 3: Implement deterministic graph Workflow**

Use `proxyActivities` and `defineSignal`, `defineQuery`, and `setHandler`. Keep the graph topology in plain deterministic code. Use child Workflows for ticket attempts and `Promise.all` only for explicitly independent branches. Never import Node APIs, provider clients, or factory Activities into Workflow code.

- [ ] **Step 4: Define Activity policies**

Set `startToCloseTimeout`, `scheduleToCloseTimeout`, heartbeat timeouts for long Gondolin/Pi work, and explicit retry policies. Mark invalid task configuration, security rejection, and policy denial as non-retryable errors. Keep transient network/worker failures retryable.

- [ ] **Step 5: Implement Activity registry**

Register side-effect functions separately from Workflow code. Persist task/artifact/event projections in Activities so replay cannot duplicate external writes.

- [ ] **Step 6: Run tests and build**

Run: `npm test -- --run tests/temporal/factory-workflow.test.ts && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 7: Commit**

```bash
git add src/temporal/workflows src/temporal/activities tests/temporal
git commit -m "feat: execute factory graph with temporal workflows"
```

---

### Task 3: Replace process execution with official Gondolin Activities

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/temporal/activities/gondolin-activities.ts`
- Create: `src/agents/gondolin-session.ts`
- Create: `src/workspaces/gondolin-provider.ts`
- Create: `tests/temporal/gondolin-activities.test.ts`
- Create: `tests/agents/gondolin-session.test.ts`

**Interfaces:**

```ts
export interface GondolinActivityInput {
  worktreePath: string;
  role: string;
  prompt: string;
  correlation: CorrelationContext;
}
```

- [ ] **Step 1: Write failing Gondolin Activity tests**

Use an injected official-SDK-shaped fake. Assert one VM is created per Activity attempt, `/workspace` maps to the worktree, built-in Pi tools are routed through the official extension, cleanup occurs on success/failure/cancellation, and no process provider is selected in arbitrary-code mode.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- --run tests/temporal/gondolin-activities.test.ts tests/agents/gondolin-session.test.ts`.
Expected: FAIL because the Activity/session adapters are absent.

- [ ] **Step 3: Pin and load the official Gondolin package**

Use `@earendil-works/gondolin` version `0.12.0` and the official Pi Gondolin extension through `DefaultResourceLoader.additionalExtensionPaths`. Do not copy or modify VM, filesystem, or network isolation code.

- [ ] **Step 4: Implement Activity lifecycle**

Create the VM/session inside the Activity, route Pi's built-in tools through Gondolin, propagate Activity cancellation to VM shutdown, and close the VM in `finally`. Keep Context7, web search, LiteLLM, and Hindsight as host-side network-only tools.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- --run tests/temporal/gondolin-activities.test.ts tests/agents/gondolin-session.test.ts && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/temporal/activities src/agents src/workspaces tests/temporal tests/agents
git commit -m "feat: run factory activities in gondolin-backed pi sessions"
```

---

### Task 4: Add organization GitHub Projects v2 task provider

**Files:**
- Create: `src/tasks/task-provider.ts`
- Create: `src/tasks/project-registry.ts`
- Create: `src/integrations/github-projects.ts`
- Create: `src/api/github-webhook.ts`
- Create: `tests/integrations/github-projects.test.ts`
- Create: `tests/api/github-webhook.test.ts`
- Modify: `src/db/schema.sql`
- Modify: `src/db/application-store.ts`

**Interfaces:**

```ts
export interface FactoryTask {
  id: string;
  projectId: string;
  projectItemId: string;
  title: string;
  description: string;
  repository: string;
  baseBranch: string;
  workflow: string;
  deploymentProfile: string;
  sandboxProfile: string;
}

export interface TaskProvider {
  listReady(): Promise<FactoryTask[]>;
  updateStatus(taskId: string, status: string, runId?: string): Promise<void>;
}
```

- [ ] **Step 1: Write normalization/idempotency tests**

Cover issue items from two repositories, draft issues using the Repository field, missing routing fields, pagination, duplicate webhook deliveries, and repeated status updates.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- --run tests/integrations/github-projects.test.ts tests/api/github-webhook.test.ts`.
Expected: FAIL because the provider is absent.

- [ ] **Step 3: Add catalog fields and uniqueness**

Persist provider, organization, project node ID, project item ID, content node ID, repository, branch, workflow, profiles, and Temporal workflow ID. Enforce uniqueness on `(provider, project_item_id)`.

- [ ] **Step 4: Implement GraphQL reconciliation**

Query Project v2 items with content and custom fields. Resolve configured field names to IDs. Use `updateProjectV2ItemFieldValue` for status/run fields. Treat Project status as an external projection, not the execution state.

- [ ] **Step 5: Implement signed organization webhook intake**

Verify GitHub App signatures, deduplicate delivery IDs, and start or signal Temporal Workflows outside the HTTP request. Never execute agent work in the webhook handler.

- [ ] **Step 6: Run tests and build**

Run: `npm test -- --run tests/integrations/github-projects.test.ts tests/api/github-webhook.test.ts && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 7: Commit**

```bash
git add src/tasks src/integrations/github-projects.ts src/api/github-webhook.ts src/db tests/integrations tests/api
git commit -m "feat: use organization github projects as task provider"
```

---

### Task 5: Add SSH Docker deployment Activity and health checks

**Files:**
- Create: `src/deploy/ssh-executor.ts`
- Create: `src/deploy/health-checker.ts`
- Create: `tests/deploy/ssh-executor.test.ts`
- Create: `tests/deploy/health-checker.test.ts`
- Modify: `src/deploy/docker-vps.ts`
- Modify: `src/temporal/activities/factory-activities.ts`

- [ ] **Step 1: Write failing tests**

Test fixed SSH argv construction, host allowlisting, timeout handling, digest-only images, bounded health retries, and rollback after failed health.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- --run tests/deploy && npm run build`.
Expected: FAIL because SSH executor and health checker are absent.

- [ ] **Step 3: Implement `SshExecutor`**

Call `execFile("ssh", [configuredHostAlias, "--", ...dockerArgs])`. Do not pass task text as a host, executable, or unrestricted argument. Keep deployment targets in typed configuration.

- [ ] **Step 4: Implement `HealthChecker`**

Use `fetch` with `AbortSignal.timeout`, fixed bounded attempts, and expected status/marker checks. Throw a non-success error after exhaustion so Temporal applies the Activity policy.

- [ ] **Step 5: Wire deployment Activity**

Pull the digest, start the candidate, check health, and restore the previous digest on failure. Record image digest, target profile, commands, health evidence, and rollback result in the Postgres projection.

- [ ] **Step 6: Run tests and build**

Run: `npm test -- --run tests/deploy && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 7: Commit**

```bash
git add src/deploy src/temporal/activities tests/deploy
git commit -m "feat: deploy through retryable temporal activity"
```

---

### Task 6: Wire Temporal, GitHub Projects, Gondolin, and deployment end to end

**Files:**
- Modify: `src/container.ts`
- Modify: `src/server.ts`
- Create: `tests/e2e/production-loop.test.ts`
- Modify: `README.md`
- Modify: `infra/compose/docker-compose.yml`

- [ ] **Step 1: Write the end-to-end test**

Start two tasks from one organization Project with different repositories. Assert stable Temporal Workflow IDs, independent worktrees and Gondolin sessions, retryable Activity failure, Project field projection, digest deployment, rollback, and Workflow Query status.

- [ ] **Step 2: Run the test and verify it fails before wiring**

Run: `npm test -- --run tests/e2e/production-loop.test.ts`.
Expected: FAIL until the Temporal composition is wired.

- [ ] **Step 3: Wire daemon startup**

Start the API/webhook server and Temporal Workers from typed configuration. Do not start a custom scheduler. Configure task queues by Activity risk/capacity: control, agent, sandbox, and deploy.

- [ ] **Step 4: Add operational Compose configuration**

Declare Temporal, its Postgres persistence, factory Postgres, LiteLLM, Hindsight, and the factory worker services. Use health checks and environment-based credentials; no manual setup commands are required beyond providing secrets.

- [ ] **Step 5: Document run and recovery behavior**

Document Workflow IDs, Signals, Queries, Activity retry classes, Gondolin requirements (QEMU/Node), GitHub App permissions/webhook setup, and deployment target configuration.

- [ ] **Step 6: Run the full verification suite**

Run:

```bash
npm run test:run
npm run build
git diff --check
```

Expected: all tests pass, build succeeds, and no whitespace errors exist.

- [ ] **Step 7: Commit**

```bash
git add src tests README.md infra/compose
git commit -m "feat: complete temporal production execution loop"
```
