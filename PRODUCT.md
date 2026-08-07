# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a factory operator running the self-hosted stack locally (or equivalent). They start tasks from one free-form prompt, review inferred task context, answer clarification requests, watch the live pipeline graph, cancel runs, rerun nodes, and decide what to do when a run succeeds, fails, rolls back, or is cancelled.

The dashboard and HTTP API serve that operating loop. End customers of software the factory builds are out of scope for this product surface.

## Product Purpose

Software Factory is a production-only, graph-oriented software factory. It accepts an engineering task against a git repository, isolates work in a Crabbox-backed worktree, and walks a fixed Temporal node graph through discovery-plan → implement → deterministic checks → maintainability assessment → behavioral verify → review → build → canary release (with clarification, repair, and refactor loops where policy allows).

Success means a run reaches a correct terminal outcome with durable evidence: promote when gates pass, otherwise fail, roll back, or cancel — never a silent host-process shortcut.

## Positioning

The graph owns control flow. Workflow topology, retries, gates, and promotion live in TypeScript/Temporal code. Pi agents are bounded nodes for judgment-heavy work (scout, plan, implement, repair, critic, review); they do not choose the next phase, bypass gates, or deploy. Deterministic work stays deterministic. Neighboring “agent fleets” that let models drive orchestration cannot truthfully claim this separation.

## Operating Context

Operators use the local Vite dashboard (`apps/dashboard`, typically `npm run dashboard:dev` → http://localhost:5173) alongside the factory API (default port 8787), Temporal UI, optional Phoenix observability, and curl/API for task intake. Runs are observed via run list, pipeline graph, events, gates, and evidence endpoints. Write actions (create task, cancel, rerun) may require `FACTORY_API_TOKEN` / `VITE_FACTORY_API_TOKEN`.

## Capabilities and Constraints

Confirmed:

- Production-only runtime: Temporal orchestration, PostgreSQL projections, Crabbox isolation; no host-process or in-memory fallback for production paths.
- Fixed assembly-line nodes and terminal outcomes documented in README (`succeeded`, `failed`, `rolled_back`, `cancelled`).
- Local dashboard: list runs, create tasks, live pipeline graph, cancel, rerun selected node.
- Preserve factory terminology: nodes, gates, evidence, worktree, canary, promote/rollback.

Undecided / out of scope for now:

- Multi-tenant or multi-team platform UX beyond the local operator.
- Formal accessibility standard beyond ordinary web baselines (none confirmed).

## Brand Commitments

Product name: **Software Factory**. No separate brand system, logo pack, or binding voice guide was confirmed; keep language precise and operational rather than marketing-led.

## Evidence on Hand

Real product evidence: README assembly-line docs, ADRs under `docs/decisions/`, design/plan docs under `docs/superpowers/`, typed API and dashboard against live runs. No customer testimonials, case studies, press, pricing, or third-party benchmarks exist — future UI must not fabricate them.

## Product Principles

1. **Control flow is code** — agents advise and act inside nodes; the graph decides what happens next.
2. **Fail closed and leave evidence** — failures and rollbacks are first-class outcomes with durable evidence, not afterthoughts.
3. **Isolation is non-negotiable** — every attempt owns a worktree and sandboxed execution.
4. **Operator clarity over theater** — status, gates, and actions must be scannable; do not decorate away failure modes.
5. **Terminology is the product language** — use factory terms consistently; do not rebrand nodes as generic “steps” if that erases meaning.
