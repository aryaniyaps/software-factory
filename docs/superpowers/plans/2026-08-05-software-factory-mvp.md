# Software Factory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, code-defined task graph that runs independent ticket attempts in Git worktrees, invokes bounded Pi agent sessions, executes deterministic gates, and records LiteLLM/Hindsight correlation.

**Architecture:** A TypeScript modular monolith exposes a small HTTP API and runs a Postgres-backed scheduler. Workflows are typed graphs of deterministic and Pi-backed nodes. Each attempt owns a Git worktree and an injected `WorkspaceProvider`; the MVP includes a process-isolated test provider and a production provider contract, while microVM worker implementation is a separate follow-up plan. External model and memory systems are accessed over HTTP through LiteLLM and Hindsight adapters.

**Tech Stack:** Node.js 24, TypeScript, `@earendil-works/pi-coding-agent`, PostgreSQL, `pg`, TypeBox, Vitest, native `node:http`, native `node:child_process`, Docker Compose, LiteLLM, Hindsight.

## Global Constraints

- All workflow sequencing, state transitions, retries, and gates must be implemented in TypeScript.
- Pi sessions are used only by explicitly declared agent nodes.
- Every task attempt has a separate Git worktree.
- Agents never receive deployment credentials, host mounts, or a Docker socket.
- LiteLLM owns model routing and cost calculation; factory code only attaches correlation metadata.
- Hindsight owns memory storage and retrieval; factory code only selects banks and records provenance.
- No runtime download of mutable `main` branches; third-party skills are pinned to a commit.
- No untested implementation changes.
- Every non-trivial loop or state transition gets a focused automated test.

---

### Task 1: Create the TypeScript workspace and executable checks

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `src/health.ts`
- Create: `tests/health.test.ts`

**Interfaces:**
- Produces `healthCheck(): { status: "ok"; service: "software-factory" }`.

- [ ] **Step 1: Write the failing health test**

```ts
import { describe, expect, it } from "vitest";
import { healthCheck } from "../src/health.js";

describe("healthCheck", () => {
  it("returns a stable service health response", () => {
    expect(healthCheck()).toEqual({ status: "ok", service: "software-factory" });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/health.test.ts`
Expected: FAIL because `src/health.ts` does not exist.

- [ ] **Step 3: Add the minimum workspace and implementation**

Use ESM TypeScript, Node 24, `tsx` for development, `vitest` for tests, `pg` for persistence, `typebox` for schemas, and Pi SDK packages for agent nodes. Add scripts:

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest",
    "test:run": "vitest run",
    "dev": "tsx src/server.ts"
  }
}
```

Implement `healthCheck()` with the exact return value above.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- --run tests/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env.example README.md src/health.ts tests/health.test.ts
git commit -m "chore: bootstrap software factory workspace"
```

---

### Task 2: Add the durable graph schema and repository

**Files:**
- Create: `src/graph/types.ts`
- Create: `src/graph/graph.ts`
- Create: `src/db/schema.sql`
- Create: `src/db/database.ts`
- Create: `src/db/graph-repository.ts`
- Create: `tests/graph/graph.test.ts`
- Create: `tests/db/graph-repository.test.ts`

**Interfaces:**

```ts
export type NodeKind = "deterministic" | "agent";
export type NodeStatus = "pending" | "leased" | "running" | "succeeded" | "retrying" | "failed" | "cancelled";

export interface GraphNode {
  id: string;
  runId: string;
  kind: NodeKind;
  name: string;
  status: NodeStatus;
  attempt: number;
  input: unknown;
  output?: unknown;
  error?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
}

export interface GraphEdge { from: string; to: string; }
export interface WorkflowGraph { nodes: GraphNode[]; edges: GraphEdge[]; }
export function readyNodes(graph: WorkflowGraph): GraphNode[];
```

- [ ] **Step 1: Write graph readiness tests**

Cover: root nodes are ready; a dependent node waits for all predecessors; failed/cancelled predecessors make a dependent node unavailable; independent roots are returned together; result ordering is stable by node ID.

- [ ] **Step 2: Run graph tests and verify they fail**

Run: `npm test -- --run tests/graph/graph.test.ts`
Expected: FAIL because graph types and `readyNodes` are absent.

- [ ] **Step 3: Implement the in-memory graph functions**

Implement `readyNodes` with a single dependency scan. Do not add a general graph library.

- [ ] **Step 4: Run graph tests and verify they pass**

Run: `npm test -- --run tests/graph/graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the Postgres repository tests**

Use a repository interface and a fake transaction in unit tests. Test creating a run, creating nodes/edges, leasing one ready node, lease expiry, completing a node, and appending an event.

- [ ] **Step 6: Add the SQL schema and repository implementation**

Create tables for `runs`, `nodes`, `edges`, `events`, `artifacts`, and `leases`. Use UUID/text IDs, JSONB envelopes, timestamps, unique node IDs, and indexes on `(status, lease_expires_at)`. Implement lease acquisition with a transaction and `FOR UPDATE SKIP LOCKED`.

- [ ] **Step 7: Run repository tests and the compiler**

Run: `npm test -- --run tests/db/graph-repository.test.ts` and `npm run build`.
Expected: PASS and a clean TypeScript build.

- [ ] **Step 8: Commit**

```bash
git add src/graph src/db tests/graph tests/db
git commit -m "feat: add durable graph state and leases"
```

---

### Task 3: Implement typed workflow definitions and the MVP workflow

**Files:**
- Create: `src/workflow/node.ts`
- Create: `src/workflow/workflow.ts`
- Create: `src/workflow/mvp-workflow.ts`
- Create: `src/workflow/envelopes.ts`
- Create: `tests/workflow/mvp-workflow.test.ts`

**Interfaces:**

```ts
export interface NodeContext {
  runId: string;
  ticketId: string;
  attemptId: string;
  worktreePath: string;
}

export interface WorkflowNode<I = unknown, O = unknown> {
  name: string;
  kind: "deterministic" | "agent";
  run(input: I, context: NodeContext): Promise<O>;
}

export interface WorkflowDefinition {
  name: string;
  nodes: WorkflowNode[];
  edges: Array<[string, string]>;
}
```

- [ ] **Step 1: Write workflow shape tests**

Assert the MVP workflow contains `prepare_repository`, `create_worktree`, `security_scan`, `scout`, `plan`, `implement`, `deterministic_checks`, `repair_loop`, `review`, `build_image`, `deploy`, and `health_check`; only the five judgment-heavy phases are agent nodes; dependencies are acyclic.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run tests/workflow/mvp-workflow.test.ts`
Expected: FAIL because the workflow modules are absent.

- [ ] **Step 3: Implement typed node and envelope definitions**

Define success/failure envelopes with `status`, `summary`, `artifacts`, `notesForNextNode`, and phase-specific fields. Reject unknown or missing required fields at the repository boundary.

- [ ] **Step 4: Implement the MVP workflow graph**

Construct the graph in TypeScript. Keep node functions injected so tests can use fakes and production wiring can provide Git, sandbox, Pi, LiteLLM, Hindsight, and deployment adapters.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- --run tests/workflow/mvp-workflow.test.ts && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 6: Commit**

```bash
git add src/workflow tests/workflow
git commit -m "feat: define typed MVP workflow graph"
```

---

### Task 4: Add Git repository and worktree management

**Files:**
- Create: `src/workspaces/git.ts`
- Create: `src/workspaces/worktree-manager.ts`
- Create: `tests/workspaces/worktree-manager.test.ts`

**Interfaces:**

```ts
export interface WorktreeManager {
  create(input: { repository: string; runId: string; ticketId: string; attemptId: string }): Promise<{ path: string; branch: string }>;
  remove(path: string): Promise<void>;
}
```

- [ ] **Step 1: Write tests using a temporary Git repository**

Test unique branch/path generation, worktree creation, repository status cleanliness before creation, and removal. Test that a path component containing `/`, `..`, or shell metacharacters is rejected.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run tests/workspaces/worktree-manager.test.ts`
Expected: FAIL because the manager is absent.

- [ ] **Step 3: Implement native Git execution**

Use `execFile` with argument arrays, never shell interpolation. Create branches named `factory/<runId>/<ticketId>/<attemptId>` and worktrees below a configured root. Capture stdout/stderr and convert non-zero exits to typed errors.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- --run tests/workspaces/worktree-manager.test.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workspaces tests/workspaces
git commit -m "feat: manage isolated git worktrees"
```

---

### Task 5: Add workspace and deterministic command adapters

**Files:**
- Create: `src/workspaces/provider.ts`
- Create: `src/workspaces/process-provider.ts`
- Create: `src/gates/command-gate.ts`
- Create: `src/gates/security-gate.ts`
- Create: `tests/workspaces/process-provider.test.ts`
- Create: `tests/gates/command-gate.test.ts`
- Create: `tests/gates/security-gate.test.ts`

**Interfaces:**

```ts
export interface WorkspaceProvider {
  create(spec: { path: string; network: "none" | "restricted" }): Promise<{ id: string }>;
  exec(id: string, command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  destroy(id: string): Promise<void>;
}
```

- [ ] **Step 1: Write gate tests**

Cover command success/failure, timeout conversion, output truncation, detection of committed secrets/private keys, and rejection of privileged workspace settings.

- [ ] **Step 2: Run gate tests and verify they fail**

Run: `npm test -- --run tests/gates tests/workspaces/process-provider.test.ts`.
Expected: FAIL because providers and gates are absent.

- [ ] **Step 3: Implement the provider contract and test provider**

Implement `ProcessWorkspaceProvider` only for local integration tests. It must execute with an explicit cwd, environment allowlist, timeout, output cap, and no shell string. Mark it as non-production in its type/configuration; production startup must reject it when arbitrary-code mode is enabled.

- [ ] **Step 4: Implement deterministic command and security gates**

The command gate runs declared project commands through the provider. The security gate scans checked-out files for private keys, common credential files, unsafe Docker configuration, and suspicious scripts, returning evidence rather than claiming the code is safe. Passing the gate never removes sandbox requirements.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- --run tests/gates tests/workspaces/process-provider.test.ts && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 6: Commit**

```bash
git add src/workspaces src/gates tests/workspaces tests/gates
git commit -m "feat: add workspace and deterministic gate adapters"
```

---

### Task 6: Add Pi agent nodes, pinned skills, and tool policy

**Files:**
- Create: `src/agents/pi-agent.ts`
- Create: `src/agents/agent-node.ts`
- Create: `src/agents/tool-policy.ts`
- Create: `src/agents/prompts/scout.md`
- Create: `src/agents/prompts/plan.md`
- Create: `src/agents/prompts/implement.md`
- Create: `src/agents/prompts/repair.md`
- Create: `src/agents/prompts/review.md`
- Create: `tests/agents/agent-node.test.ts`
- Create: `skills/engineering/README.md`
- Create: `skills/engineering/REVISION`

**Interfaces:**

```ts
export interface AgentRunner {
  run(input: { role: string; prompt: string; cwd: string; metadata: Record<string, string> }): Promise<{ text: string; sessionId: string; usage?: unknown }>;
}
```

- [ ] **Step 1: Write agent-node tests with a fake runner**

Test prompt construction includes predecessor envelopes, worktree path, phase role, and correlation metadata. Test that a malformed final envelope fails the node and that tool policy returns only the tools assigned to the phase.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/agents/agent-node.test.ts`.
Expected: FAIL because the runner and node are absent.

- [ ] **Step 3: Implement Pi SDK runner**

Use `ModelRuntime.create()` and `createAgentSession()` with `SessionManager.inMemory()` for an attempt unless persistence is explicitly configured. Subscribe to Pi events, capture the session ID and tool lifecycle, and send model requests through the configured LiteLLM-compatible provider. Do not expose deployment tools.

- [ ] **Step 4: Implement resource loading and phase tool policy**

Load project skills through `DefaultResourceLoader`. Pin the Matt Pocock engineering skill revision in `skills/engineering/REVISION`; do not fetch mutable branches during a run. Select only the skill and tools needed by the phase.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- --run tests/agents/agent-node.test.ts && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 6: Commit**

```bash
git add src/agents skills/engineering tests/agents
git commit -m "feat: run bounded pi agent graph nodes"
```

---

### Task 7: Add LiteLLM and Hindsight integrations

**Files:**
- Create: `src/integrations/litellm.ts`
- Create: `src/integrations/hindsight.ts`
- Create: `src/integrations/correlation.ts`
- Create: `tests/integrations/litellm.test.ts`
- Create: `tests/integrations/hindsight.test.ts`
- Create: `infra/compose/docker-compose.yml`
- Create: `infra/compose/litellm.config.yaml`
- Create: `infra/compose/hindsight.env.example`

**Interfaces:**

```ts
export interface CorrelationContext {
  factoryRunId: string;
  initiativeId?: string;
  ticketId: string;
  attemptId: string;
  phaseId: string;
  agentRole?: string;
  worktreeId?: string;
}

export interface MemoryProvider {
  recall(bank: string, query: string, context: CorrelationContext): Promise<unknown[]>;
  retain(bank: string, content: string, context: CorrelationContext): Promise<void>;
  reflect(bank: string, query: string, context: CorrelationContext): Promise<string>;
}
```

- [ ] **Step 1: Write HTTP contract tests with mocked fetch**

Test LiteLLM request metadata includes all correlation fields, and Hindsight requests use `factory-global`, `project:<id>`, `ticket:<id>`, and `agent-role:<role>` bank names. Test non-2xx responses become typed integration errors.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/integrations`.
Expected: FAIL because adapters are absent.

- [ ] **Step 3: Implement the adapters with native fetch**

LiteLLM is configured as the Pi provider endpoint and receives metadata for spend reporting. Hindsight uses its documented retain/recall/reflect HTTP API. Do not implement token pricing, vector search, or transcript storage.

- [ ] **Step 4: Add declared local services**

Add Postgres, LiteLLM, and Hindsight service definitions to Docker Compose with named persistent volumes and health checks. Keep credentials in environment variables and provide only examples in the repository.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- --run tests/integrations && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 6: Commit**

```bash
git add src/integrations infra/compose tests/integrations
git commit -m "feat: integrate litellm and hindsight"
```

---

### Task 8: Implement the scheduler, API, and event stream

**Files:**
- Create: `src/scheduler/scheduler.ts`
- Create: `src/scheduler/worker.ts`
- Create: `src/api/server.ts`
- Create: `src/api/routes.ts`
- Create: `src/events/event-store.ts`
- Create: `tests/scheduler/scheduler.test.ts`
- Create: `tests/api/server.test.ts`

**Interfaces:**

```ts
export interface Scheduler {
  tick(): Promise<void>;
  start(signal: AbortSignal): Promise<void>;
}

export interface CreateTaskRequest {
  repository: string;
  title: string;
  description: string;
  dependencies?: string[];
}
```

- [ ] **Step 1: Write scheduler tests**

Test that a tick leases all ready independent nodes up to concurrency, does not lease blocked nodes, requeues expired leases, records success/failure events, and never runs two owners for one node.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/scheduler/scheduler.test.ts`.
Expected: FAIL because the scheduler is absent.

- [ ] **Step 3: Implement the worker loop**

The worker leases a node, loads its input envelope, invokes the injected node implementation, validates output, persists the result and event atomically, and releases or retries the node. Use an `AbortController` for shutdown and no unbounded retry loop.

- [ ] **Step 4: Implement the HTTP API**

Use native `node:http`. Add `POST /tasks`, `GET /runs/:id`, `GET /runs/:id/events`, `POST /runs/:id/cancel`, and `POST /nodes/:id/retry`. Validate JSON with TypeBox and return JSON errors with stable status codes.

- [ ] **Step 5: Add server tests**

Test task creation, malformed requests, run status retrieval, cancellation, retry, and event ordering.

- [ ] **Step 6: Run tests and build**

Run: `npm test -- --run tests/scheduler tests/api && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 7: Commit**

```bash
git add src/scheduler src/api src/events tests/scheduler tests/api
 git commit -m "feat: add durable scheduler and task api"
```

---

### Task 9: Wire the end-to-end vertical slice

**Files:**
- Create: `src/container.ts`
- Create: `src/server.ts`
- Create: `tests/e2e/task-run.test.ts`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- `createApplication(config): Promise<Application>` wires all repositories and providers without global mutable state.

- [ ] **Step 1: Write the end-to-end test**

Use a temporary Git repository and fake agent, provider, deployment, LiteLLM, and Hindsight adapters. Submit one task, run the scheduler, assert graph transitions through every MVP phase, and assert events contain the run, ticket, attempt, node, worktree, and session correlation fields.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run tests/e2e/task-run.test.ts`.
Expected: FAIL because application wiring is absent.

- [ ] **Step 3: Implement dependency wiring and process entrypoint**

Read environment variables through a typed config loader. Refuse startup when arbitrary-code execution is enabled with the process provider. Wire repositories, graph workflow, agents, integrations, scheduler, and HTTP server.

- [ ] **Step 4: Run end-to-end and all tests**

Run: `npm test -- --run tests/e2e/task-run.test.ts && npm run test:run && npm run build`.
Expected: PASS and clean build.

- [ ] **Step 5: Document code-defined startup**

Update README with the repository architecture, required environment variables, `docker compose -f infra/compose/docker-compose.yml up`, `npm install`, `npm run build`, `npm run dev`, API examples, and the explicit warning that a production sandbox provider is required for arbitrary repositories.

- [ ] **Step 6: Commit**

```bash
git add src tests README.md .env.example
git commit -m "feat: wire software factory MVP"
```

---

### Task 10: Add the production sandbox provider as a separate plan boundary

**Files:**
- Create: `packages/sandbox-worker/README.md`
- Create: `packages/sandbox-worker/src/server.ts`
- Create: `packages/sandbox-worker/src/provider.ts`
- Create: `packages/sandbox-worker/tests/provider.test.ts`
- Modify: `infra/compose/docker-compose.yml`

**Interfaces:**
- The worker implements the same `WorkspaceProvider` HTTP contract used by `src/workspaces/provider.ts`.

- [ ] **Step 1: Select and document one self-hosted backend**

Evaluate OpenSandbox, CubeSandbox, and a Firecracker/Kata deployment against startup time, filesystem persistence, network policy, resource limits, and API stability. Record the selected backend and rejection reasons in an ADR before implementation.

- [ ] **Step 2: Write provider contract tests**

Test create/exec/snapshot/destroy, network-deny defaults, resource limits, and cleanup after failure against a local test double.

- [ ] **Step 3: Implement the worker adapter**

Expose only the provider operations required by the factory. Validate all paths and commands at the worker boundary, pass short-lived credentials through the provider’s injection mechanism, and reject host mounts, privileged mode, and Docker socket requests.

- [ ] **Step 4: Add deployment configuration and integration checks**

Declare the worker in Compose and document a fully code-defined startup path. Do not make the factory silently fall back to the unsafe process provider.

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox-worker infra/compose docs/decisions
git commit -m "feat: add self-hosted sandbox worker"
```

---

## Verification checklist

Before claiming the MVP is complete:

- `npm run test:run`
- `npm run build`
- `git diff --check`
- API creates and resumes a run in a Postgres-backed integration test
- two independent nodes run concurrently in separate worktrees
- a failed deterministic gate produces a repair node
- a worker restart reclaims an expired lease
- LiteLLM correlation metadata is visible in captured requests
- Hindsight recall and retain calls are captured for agent phases
- production startup rejects the process workspace provider for arbitrary code
- sandbox worker tests pass before enabling arbitrary third-party repository execution
