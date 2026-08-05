# Sprint 1: Production Execution Loop

**Status:** Proposed
**Base:** `feat/software-factory-mvp`
**Date:** 2026-08-06

## Goal

Turn the MVP graph into a self-hosted production execution loop by using Pi's official Gondolin integration for sandboxed agent/tool execution, replacing in-memory scheduling with Postgres leases, consuming organization-scoped GitHub Projects v2 across multiple repositories, and deploying immutable Docker images over SSH with health checks and rollback.

## Decisions

### Gondolin, not a custom sandbox

Use the official `@earendil-works/gondolin` package and Pi's official Gondolin extension pattern. The factory will not implement a VM, hypervisor, network policy engine, filesystem virtualization layer, or custom sandbox protocol.

Pi remains the host-side agent process, while its built-in tools are routed into a Gondolin Linux micro-VM. Each attempt gets a disposable VM and a disposable Git worktree. The worktree is mounted at `/workspace`; changes are intentionally written back to the attempt worktree so the host can collect diffs.

Custom research/memory tools remain host-side network clients. They receive no host filesystem or shell access. Model credentials stay outside the VM where possible and model traffic is routed through LiteLLM.

### Postgres is the scheduler authority

The scheduler uses the existing Postgres schema and `FOR UPDATE SKIP LOCKED` leasing query. Workers are stateless processes identified by worker IDs. A lease expiry requeues abandoned nodes. State transitions and events are persisted before a worker acknowledges completion.

### GitHub Organization Projects is the first task provider

An organization-owned GitHub Projects v2 project is the human task/control surface. Its items may be issues, pull requests, or draft issues from multiple repositories. The adapter uses GraphQL for project items and custom fields, plus organization `projects_v2_item` webhooks for near-real-time updates.

The factory requires these project fields: `Factory Status`, `Repository`, `Base Branch`, `Workflow`, `Deployment Profile`, `Sandbox Profile`, and `Factory Run ID`. For issue and pull-request items, repository metadata can be read from the item content; draft issues must provide the `Repository` field. The graph remains the source of truth for attempts; GitHub remains the task and status surface.

### Docker VPS is the first deployer

The deployer uses `execFile("ssh", args)` and never constructs a shell command from untrusted input. It pulls an image by digest, starts the new container, checks an HTTP health endpoint, and restores the previous digest on failure.

## Runtime flow

```text
Organization GitHub Project item / API
      -> ProjectRegistry resolves repository + execution profiles
      -> Postgres task + graph
      -> worker lease
      -> host Git worktree
      -> Gondolin VM for agent and project commands
      -> deterministic gates
      -> review and artifact digest
      -> SSH Docker deployment
      -> health check
      -> rollback or terminal success
```

Independent tickets lease concurrently. A ticket's phases remain sequential until the graph supports explicit fan-out/fan-in edges.

## Required components

- `GondolinSessionFactory`: loads the official Pi Gondolin extension through `DefaultResourceLoader` and disposes the VM with the session.
- `GondolinWorkspaceProvider`: thin adapter around the official Gondolin SDK for deterministic commands and file operations; it contains no isolation logic.
- `PostgresSchedulerStore`: implements the scheduler store against the existing database repository.
- `WorkerProcess`: polls, leases, executes, records events, and renews/abandons leases safely.
- `GitHubProjectProvider`: reads organization Project v2 items, resolves custom fields, normalizes tasks across repositories, and performs idempotent field/comment updates.
- `SshDockerExecutor`: executes fixed Docker argv sequences on a configured host and validates image digests.
- `HealthChecker`: HTTP checks with timeout and bounded retries.

## Security boundaries

- No process provider is allowed when `ARBITRARY_CODE=true`.
- No host Docker socket, host home directory, SSH agent, or broad secret mounts enter Gondolin.
- Only the attempt worktree is mounted into the VM.
- Network access is policy-configured through Gondolin; default is deny except required package/model/documentation endpoints.
- GitHub and deployment credentials are held by the host control plane and never exposed as Pi tool results.
- Project item text, issue text, and repository content are untrusted prompt input.
- All external commands use argument arrays and fixed executable names.

## Verification

The sprint is complete when tests prove:

1. Pi sessions load the official Gondolin extension and clean up the VM on shutdown.
2. Project commands run in the VM, not the host process.
3. Two workers cannot lease the same node.
4. Expired leases are reclaimed and events remain ordered.
5. Organization Project v2 items from multiple repositories normalize into tasks and status updates are idempotent.
6. A digest-pinned Docker deployment passes health checks.
7. A failed health check restores the previous digest.
8. Two independent tasks execute concurrently in separate worktrees and VMs.
9. A worker restart resumes the graph without duplicate deployment.

## Non-goals

- Building a custom sandbox or microVM runtime.
- OpenShell/OpenSandbox integration in this sprint.
- Kubernetes or multi-region deployment.
- Multiple issue trackers.
- A web dashboard.
- Autonomous merge conflict resolution beyond a recorded failure.
