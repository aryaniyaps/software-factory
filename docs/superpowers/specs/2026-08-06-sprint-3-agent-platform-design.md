# Sprint 3 Agent Platform Design

## Goal

Replace raw HTTP handling with Koa and make each Pi workflow role a deliberately configured, filesystem-backed agent with deep Hindsight memory, Matt Pocock engineering skills, multi-provider web access, Ponytail, and Context Mode.

## Scope

Sprint 3 delivers a maintainable Koa API boundary, organization/project Hindsight memory banks, mission and mental-model bootstrap, memory-aware Pi tools, pinned filesystem resource installation, multi-provider web access, and role-specific Pi sessions.

The existing Temporal Workflow and Activity boundaries remain unchanged. This sprint changes how the API is served and how agent Activities construct Pi sessions; deterministic sequencing, Gondolin isolation, and deployment remain owned by Sprint 2 components.

## Architecture

### Koa API

`src/api/server.ts` becomes a Koa application factory. Koa owns request parsing, error middleware, status handling, and routing. A router maps the existing task/run/event/cancel/retry endpoints to the existing `ApiStore` interface. The server entrypoint calls `app.callback()` and keeps lifecycle/shutdown explicit. Request validation stays at the HTTP boundary; stores and workflows receive typed values only.

### Hindsight memory

Memory is scoped to one organization/project bank. Repository and run separation is enforced with tags rather than creating a bank for every run. A bank name is derived from an allowlisted organization/project identifier.

Every retain call adds tags and correlation metadata:

- `org:<organization>`
- `project:<project>`
- `repository:<owner/repo>`
- `run:<run-id>`
- `role:<role>`
- `phase:<phase>`

Bank bootstrap imports a versioned template containing:

- `retain_mission`: retain decisions, constraints, repository conventions, failure causes, repairs, and deployment outcomes;
- `observations_mission`: consolidate recurring engineering patterns, risks, and successful practices;
- `reflect_mission`: answer as a concise factory engineering advisor using evidence from the project bank;
- mental models for architecture, repository conventions, test failures, deployment safety, and project history;
- directives for security, evidence, and uncertainty handling.

The memory adapter exposes `retain`, `recall`, `reflect`, mental-model retrieval, and template bootstrap. Mental-model refresh operations are asynchronous and are observed through the Hindsight operation API. Every agent role receives a memory context assembled from the current project/repository/run tags before its Pi prompt.

### Filesystem-backed Pi resources

The factory owns a versioned resource manifest under `infra/pi`. It pins:

- Matt Pocock engineering skills copied into `skills/engineering`;
- `pi-web-access`;
- `@dietrichgebert/ponytail`;
- `context-mode`.

A bootstrap command installs these packages into a factory-owned Pi resource directory. The directory is mounted read-only into Gondolin and passed to `DefaultResourceLoader` as the resource root. The target repository never supplies or overrides factory skills and extensions.

### Multi-provider web access

Pi Web Access is configured with explicit `provider: "all"` or an equivalent ordered `searchRouting` policy in the factory-owned config. Provider credentials come from environment-backed configuration and are never placed in prompts, repositories, or the VM filesystem. Search responses retain provider labels and source URLs so agents can compare evidence.

### Role profiles

A role profile is data, not a branch in `PiAgentRunner`. Each profile declares allowed skills, Pi tools, custom tools, Hindsight operations, web policy, and thinking level:

- **scout:** repository inspection, Context7, multi-provider web search, recall, reflect;
- **plan:** architecture/design skills, Context7, web search, mental models, recall, reflect;
- **implement:** implementation/TDD skills, filesystem tools, targeted web search, recall;
- **repair:** diagnosing-bugs/TDD skills, test output, failure memories, targeted web search;
- **review:** code-review/security skills, recall, reflect, source-backed web search.

`PiAgentRunner` creates a fresh `DefaultResourceLoader` and tool allowlist from the selected profile. A role cannot request tools or skills outside its profile. All profiles receive correlation metadata and the project memory context.

## Data flow

1. API receives a task through Koa and validates the request.
2. The Temporal Activity resolves the organization/project bank and loads the role profile.
3. Hindsight recall/reflect and applicable mental models produce a bounded context packet.
4. Pi starts inside Gondolin with the read-only factory resource directory, role-specific tools, and memory packet.
5. Pi output and phase outcome are retained with role/phase/repository/run tags.
6. Hindsight operation IDs are logged into the Postgres projection without blocking the critical workflow path.

## Failure and security

- Invalid API JSON or request shape returns a bounded 4xx response through Koa error middleware.
- Hindsight outage does not execute host-side fallback code; the Activity uses a bounded retry policy and can continue with an explicitly marked empty memory context only for non-security-critical roles.
- Missing required role skill or package fails session construction before arbitrary code runs.
- Web provider failures are returned as provider-labelled diagnostics; one provider failure does not discard successful providers.
- Provider credentials remain in the worker environment and are unavailable to repository commands.
- Memory writes are asynchronous and idempotent by correlation document ID.
- No role profile may include host shell execution outside Gondolin.

## Testing

- Koa route tests preserve the existing API behavior and verify malformed input/error middleware.
- Hindsight tests verify bank naming, tag construction, mission/template bootstrap, mental-model selection, and operation handling through fake clients.
- Resource tests verify all required `SKILL.md` files and package manifests exist in the factory filesystem.
- Web-access tests verify `provider: "all"`, source-labelled aggregation, and credential redaction.
- Role tests verify each profile’s exact skills/tools/MCP set and reject unauthorized tool requests.
- Pi session tests verify a fresh loader per role, read-only resource paths, bounded memory context, and correlation metadata.
- Integration tests construct scout, planner, implementer, repairer, and reviewer sessions concurrently and verify isolated configurations.

## Non-goals

- No replacement of Temporal, Gondolin, Postgres projections, or GitHub Projects.
- No custom web-search provider implementation; Pi Web Access owns provider integrations.
- No custom Hindsight storage or vector database.
- No shared mutable Pi session between workflow roles.
- No unpinned package installation during a workflow run.

## Acceptance criteria

- The API is served by Koa with the existing endpoint behavior preserved.
- Organization/project Hindsight banks bootstrap missions, directives, and mental models from versioned configuration.
- Each role receives the intended filesystem skills and distinct tool/MCP policy.
- Pi Web Access aggregates multiple configured providers and preserves source attribution.
- Hindsight context is recalled/reflected before each role and outcomes are retained afterward.
- Matt Pocock skills, Ponytail, Context Mode, and Pi Web Access are available from the factory-owned filesystem inside Gondolin.
- Concurrent role sessions do not share mutable loaders, memory packets, or tool state.
- Full tests, TypeScript build, and `git diff --check` pass.
