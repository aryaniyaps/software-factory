# Temporal Execution Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Temporal the sole authority for the runtime execution graph and remove all PostgreSQL execution projections.

**Architecture:** Workflow protocol 3 owns a versioned graph and execution view, Visibility lists executions, and Workflow messages apply commands. Activities return execution descriptors; object storage holds only large content-addressed bodies. PostgreSQL retains GitHub installations and A2A tasks.

**Tech Stack:** TypeScript, Node 24, Temporal TypeScript SDK, Koa, React Flow, Drizzle/PostgreSQL, Vitest.

## Global Constraints

- No application PostgreSQL table may store runs, nodes, calls, evidence indexes, gates, scenarios, or deployments.
- No dashboard node or edge registry may duplicate workflow topology.
- Object bodies are addressed and verified by SHA-256; only referenced objects may be served.
- New APIs support protocol-3 executions only; old projections are not migrated.
- Temporal retention is 90 days with no archive read path.
- Every behavioral change follows a failing-test-first cycle.

---

### Task 1: Define the execution view and graph

- [ ] Add failing contract and workflow-query tests for versioned nodes, edges, attempts, current state, calls, evidence, and outcome.
- [ ] Implement the protocol-3 graph definition, execution ledger, query, and safe Continue-As-New state.
- [ ] Run focused Temporal contract and workflow tests.

### Task 2: Remove execution projection writes

- [ ] Add failing tests proving agent, verifier, build, deploy, and health execution descriptors reach Temporal without database calls.
- [ ] Replace projection Activities/session ledger with object-backed recorders and Temporal-owned descriptors.
- [ ] Run focused activity, object-store, and workflow tests.

### Task 3: Replace the public API

- [ ] Add failing tests for start, Visibility pagination, query, commands, error mapping, and object authorization.
- [ ] Implement `/executions`, remove legacy run/evidence/feedback routes, and update A2A references.
- [ ] Run focused API and A2A tests.

### Task 4: Make the dashboard graph dynamic

- [ ] Add failing pure graph-adapter tests with topology not known to the dashboard.
- [ ] Consume the execution APIs and render query-provided nodes, edges, attempts, timeline, and panels.
- [ ] Run dashboard tests and build.

### Task 5: Cut PostgreSQL down to control-plane data

- [ ] Add a failing migration/schema test that permits only `github_installations` and `a2a_tasks`.
- [ ] Remove execution stores and generate the destructive Drizzle migration.
- [ ] Run database migration and control-plane store tests.

### Task 6: Enforce retention and verify the full story

- [ ] Add namespace-policy tests for required Search Attributes and 90-day retention.
- [ ] Add idempotent bootstrap/preflight, update compose, environment examples, README, and product documentation.
- [ ] Run build, all tests, database tests, dashboard build, contract checks, and production Temporal end-to-end verification.
