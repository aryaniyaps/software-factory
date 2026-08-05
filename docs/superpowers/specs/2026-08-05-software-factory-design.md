# Software Factory Design

**Status:** Proposed
**Date:** 2026-08-05

## Goal

Build a self-hostable, code-defined software factory that accepts tasks from a CLI, API, or issue tracker; schedules independent work in parallel Git worktrees; uses Pi agent sessions only for judgment-heavy engineering work; validates changes with deterministic gates; and deploys verified Docker artifacts with health checks and rollback.

## Design principles

1. **The graph is the product.** Workflow topology, dependencies, transitions, retries, and gates live in TypeScript code.
2. **Code owns control flow.** Agents do not choose the next phase, declare success, deploy, or bypass gates.
3. **Agents are bounded nodes.** A Pi session is used only for repository understanding, planning, implementation, diagnosis, and review.
4. **Deterministic work stays deterministic.** Git, tests, builds, scans, artifact creation, deployment, health checks, and rollback run as code.
5. **Every task is isolated.** Each attempt gets its own Git worktree and disposable execution workspace.
6. **State is durable.** A crashed daemon or worker can resume from persisted node state without duplicating side effects.
7. **Integrate instead of reinventing.** LiteLLM handles model routing and spend accounting; Hindsight handles memory; Pi handles agent sessions; Git handles worktrees; Postgres stores factory state.
8. **Scale by adding workers.** The initial daemon is small, but leases and idempotency permit multiple schedulers and workers later.

## Chosen foundation

The orchestration model follows OpenAI Symphony: a long-running daemon, explicit task states, a tracker adapter, a workspace manager, an agent runner, reconciliation, retries, and structured observability. Stripe Minions contributes the blueprint pattern: compose deterministic and agentic steps and prefer standardized execution environments. The implementation is TypeScript because the Pi SDK is the primary agent runtime.

The factory will not adopt LangGraph, Temporal, or a custom workflow DSL in the first version. The required graph runtime is small enough to keep in the repository, while the interfaces remain replaceable if durable workflow scale later requires a dedicated engine.

## Repository layout

```text
apps/factoryd/              HTTP API and scheduler process
packages/graph/             typed graph definitions, state transitions, leases
packages/workspaces/        Git worktrees and sandbox provider interface
packages/agents/            Pi session nodes, prompts, skills, tool policy
packages/integrations/      LiteLLM, Hindsight, GitHub, Context7, web search
packages/gates/             deterministic checks and security policy
packages/deploy/            Docker build, deployment, health check, rollback
packages/db/                schema, migrations, repositories
workflows/                  workflow graphs defined in TypeScript
skills/                     pinned Matt Pocock engineering skills
infra/                      Docker Compose and self-hosted worker configuration

tests/                      unit, integration, and end-to-end tests
docs/decisions/             architecture decision records
```

## Graph model

The persisted graph is:

```text
Initiative -> Ticket -> Attempt -> Phase -> AgentSession
                                      |
                                      +-> ToolCall
                                      +-> Artifact
                                      +-> Gate
```

A `Ticket` may have dependency edges to other tickets. The scheduler may enqueue a ticket only when all dependency gates are satisfied. Independent tickets run concurrently in separate worktrees.

Each node has a typed input envelope and output envelope. Node states are:

```text
pending -> leased -> running -> succeeded
                    |              |
                    +-> retrying --+
                    +-> failed
                    +-> cancelled
```

State changes are transactional and append an event record. A lease contains an owner, expiry, and attempt number. Workers must make external side effects idempotent using the node ID and attempt ID.

The first workflow is:

```text
intake
  -> prepare_repository
  -> create_worktree
  -> security_scan
  -> scout
  -> plan
  -> implement
  -> deterministic_checks
  -> repair_loop
  -> review
  -> build_image
  -> deploy
  -> health_check
  -> rollback_on_failure
```

`scout`, `plan`, `implement`, `repair_loop`, and `review` are Pi nodes. All other nodes are deterministic code nodes. A future workflow can add domain-specific nodes without changing the scheduler.

## Worktrees and parallelism

The repository is cloned or opened as a bare/shared repository. Each attempt receives a sanitized, collision-resistant worktree path and branch:

```text
/repos/project.git
/worktrees/<run-id>/<ticket-id>/<attempt-id>
```

Agents never share a mutable worktree. Context crosses boundaries through committed changes, typed envelopes, artifacts, and Hindsight memory. A merge coordinator handles dependent ticket integration and conflicts; it never asks an agent to edit another ticket's worktree.

Worktree lifecycle hooks are deterministic:

```text
after_create -> before_run -> agent/checks -> after_run -> before_remove
```

Cleanup occurs after terminal task states, while failed worktrees can be retained by policy for debugging.

## Agent runtime

`packages/agents` wraps `createAgentSession()` from `@earendil-works/pi-coding-agent`.

Each Pi node receives:

- the task and predecessor envelopes
- the current worktree path
- relevant project context files
- selected skills
- a phase-specific tool allowlist
- Hindsight recall results
- LiteLLM correlation metadata

Each node returns a strict JSON envelope. The factory validates it, records the raw session reference, and runs gates against declared artifacts. Invalid output is corrected in the same Pi session with a bounded retry.

Matt Pocock's engineering skills are vendored at a pinned revision and loaded through Pi's resource loader. The router selects flows rather than giving every agent every skill:

```text
large initiative -> wayfinder -> to-tickets
feature          -> domain-modeling -> to-tickets -> implement -> tdd -> code-review
bug              -> diagnosing-bugs -> tdd -> code-review
small change     -> implement -> tdd -> code-review
```

## Tool policy

Tools are registered as code and assigned by phase:

- Scout: read, grep, find, git, Context7, web search
- Planner: read, search, Hindsight recall, issue tracker read
- Implementer: read, edit, write, test/build commands, git
- Reviewer: read, diff, tests, static analysis
- Deployment: trusted deterministic code only

No agent receives unrestricted host access, deployment credentials, or the Docker socket. Context7 is integrated through its official MCP endpoint or a configured local MCP server. Web search is an explicit provider adapter with source capture. Tool calls are logged with node and worktree IDs.

## Memory

Hindsight is accessed through a `MemoryProvider` interface with banks scoped by:

```text
factory-global
project:<project-id>
ticket:<ticket-id>
agent-role:<role>
```

The factory recalls before scout, planning, repair, and review. It retains decisions, discoveries, failures, and deployment outcomes after successful node completion. It reflects at task completion and stores only the resulting engineering insight, not credentials or unrestricted transcripts.

## Model economics

All model calls go through LiteLLM. The factory supplies:

```text
factory_run_id
initiative_id
ticket_id
attempt_id
phase_id
agent_role
worktree_id
```

LiteLLM owns provider routing, retries/fallbacks, token usage, spend calculation, virtual keys, and budgets. The factory stores correlation IDs and reads spend summaries for run reporting; it does not recalculate token prices.

Budgets are tracked immediately but are advisory in the first release. Hard enforcement can be enabled later through LiteLLM virtual-key limits without changing graph code.

## Workspace isolation

The workspace boundary is abstracted:

```ts
interface WorkspaceProvider {
  create(spec: WorkspaceSpec): Promise<Workspace>;
  exec(id: string, command: string, options?: ExecOptions): Promise<ExecResult>;
  snapshot(id: string): Promise<Snapshot>;
  destroy(id: string): Promise<void>;
}
```

The first production-capable provider must be self-hosted and microVM- or equivalent-isolated. The provider must enforce non-root execution, no host mounts, no Docker socket, default-deny network access, scoped short-lived credentials, resource limits, immutable base images, and disposable state.

Security scanning is an admission gate, not the isolation boundary. A repository that passes static checks still executes inside the sandbox.

The provider is deliberately replaceable so self-hosted OpenSandbox/CubeSandbox/Firecracker-based workers can be evaluated without changing the graph or agent code.

## Deployment

Deployment consumes an immutable Docker image digest produced by a deterministic build node. The initial deployer targets Docker on a VPS and implements:

1. push or copy the digest
2. start the new version
3. run health checks
4. switch traffic
5. retain the previous version
6. rollback automatically when health checks fail

Production deployment is autonomous by default, but the policy engine remains a code boundary where approval requirements can be added for sensitive projects.

## API and inputs

The initial API exposes task creation, run status, node status, cancellation, retry, and artifact inspection. A CLI is a typed client of that API, not a separate execution path. Issue tracker adapters normalize GitHub/Linear-style issues into the same `Task` model.

The API never directly runs agent code. It creates graph state; workers execute leased nodes.

## Observability

Every run emits structured events containing:

```text
run_id, ticket_id, attempt_id, phase_id, node_id,
worktree_id, session_id, worker_id, model, status,
started_at, finished_at, retry_count, artifact_ids, error
```

The first release writes events to Postgres and structured logs. The design leaves a clean path to OpenTelemetry and a separate UI later. Agent transcripts and audit events are retained separately.

## Failure handling

- Invalid agent envelopes: correction prompt in the same Pi session.
- Failed deterministic gates: repair node with failure evidence.
- Worker crash: lease expiry and node requeue.
- Tracker cancellation: reconciliation cancels active nodes and cleans workspaces.
- Merge conflict: deterministic merge attempt, then a dedicated conflict-resolution node.
- Failed deployment health check: automatic rollback to the previous immutable digest.
- Repeated failure: terminal failure with retained artifacts and a resumable retry command.

## MVP acceptance criteria

The first vertical slice is complete when it can:

1. accept a task through the API;
2. create a persisted graph and isolated Git worktree;
3. run a Pi implementation node with a pinned skill set;
4. run deterministic tests in the sandbox;
5. retry the implementation using test evidence;
6. run a review node and validate its envelope;
7. build an immutable Docker artifact;
8. deploy to a self-hosted Docker VPS;
9. verify health and roll back on failure;
10. run at least two independent tickets concurrently;
11. resume a leased node after worker interruption;
12. report LiteLLM spend correlation and Hindsight memory activity.

## Explicit non-goals for the first release

- Kubernetes orchestration
- multi-region deployment
- custom model provider implementation
- autonomous production architecture changes
- unrestricted agent tools
- custom vector search or transcript database
- multiple deployment targets
- full web dashboard

These can be added after the first vertical slice is reliable and replayable.
