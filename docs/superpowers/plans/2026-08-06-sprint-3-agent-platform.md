# Sprint 3 Agent Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw HTTP handling with Koa and give every Pi workflow role filesystem-backed skills, multi-provider web access, and mission-aware Hindsight memory.

**Architecture:** Koa becomes the API boundary while `ApiStore` remains the application boundary. Hindsight provides organization/project banks with tagged memory, missions, directives, and mental models. Pi sessions are constructed from immutable role profiles, a factory-owned resource directory, and fresh per-session loaders inside Gondolin.

**Tech Stack:** Koa 3, `@koa/router`, `koa-bodyparser`, TypeScript, Hindsight TypeScript client/API, Pi `DefaultResourceLoader`, `pi-web-access`, Ponytail, Context Mode, Matt Pocock engineering skills, Vitest.

## Global Constraints

- Do not change Temporal sequencing or move orchestration into Koa.
- Do not execute repository code outside Gondolin.
- Factory skills and extensions are read-only and cannot be overridden by target repositories.
- Never put provider credentials in prompts, repository files, or Gondolin mounts.
- Every Hindsight write includes organization/project/repository/run/role/phase tags and an idempotent document ID.
- Every role receives only its declared skills, tools, MCP integrations, and Hindsight operations.
- Package versions and resource sources are declared in repository-controlled configuration.
- Use test-first implementation and commit each task independently.

---

### Task 1: Replace raw HTTP with Koa

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Rewrite: `src/api/server.ts`
- Modify: `src/server.ts`
- Modify: `tests/api/server.test.ts`
- Create: `tests/api/koa-server.test.ts`

**Interfaces:**
- `createApiApp(store: ApiStore): Koa` returns an unstarted Koa application.
- `createApiServer(store: ApiStore): Server` remains as a compatibility wrapper around `app.callback()`.
- Routes preserve existing `POST /tasks`, `GET /runs/:id`, `GET /runs/:id/events`, `POST /runs/:id/cancel`, and `POST /runs/:id/retry/:node` behavior.

- [ ] **Step 1: Add Koa route regression tests.** Assert successful task creation, run lookup, event lookup, cancellation, retry, malformed JSON, missing required fields, and store errors produce the existing status/body contract.
- [ ] **Step 2: Run the focused tests.** Run `npm test -- --run tests/api/server.test.ts tests/api/koa-server.test.ts`. Expected: the new Koa tests fail because `createApiApp` and Koa dependencies are absent.
- [ ] **Step 3: Add Koa dependencies and implement the application.** Add `koa`, `@koa/router`, `koa-bodyparser`, `@types/koa`, `@types/koa__router`, and `@types/koa-bodyparser`. Add top-level error middleware, body parser, route handlers, JSON responses, and explicit 404 handling. Keep validation at the route boundary.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/api/server.test.ts tests/api/koa-server.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add package.json package-lock.json src/api src/server.ts tests/api && git commit -m "feat: serve factory api with koa"`

---

### Task 2: Add Hindsight bank, tag, mission, and mental-model adapter

**Files:**
- Rewrite: `src/integrations/hindsight.ts`
- Modify: `src/integrations/correlation.ts`
- Create: `src/integrations/hindsight-config.ts`
- Create: `infra/hindsight/factory-bank-template.json`
- Create: `tests/integrations/hindsight-platform.test.ts`
- Modify: `tests/integrations/hindsight.test.ts`

**Interfaces:**
- `projectBankId(org, project)` returns an allowlisted stable bank ID.
- `memoryTags(context)` returns `org`, `project`, `repository`, `run`, `role`, and `phase` tags.
- `HindsightMemory.bootstrapBank(bank, template)` imports missions, directives, and mental models idempotently.
- `HindsightMemory.recallProject`, `reflectProject`, `getMentalModel`, and `retainOutcome` accept a `CorrelationContext` and apply project tags.
- `HindsightMemory` exposes operation IDs for asynchronous mental-model creation/refresh and never blocks a Workflow on refresh completion.

- [ ] **Step 1: Write failing adapter tests.** Cover stable bank IDs, exact tag construction, template import idempotency, mental-model lookup, async operation IDs, and retain document IDs.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/integrations/hindsight.test.ts tests/integrations/hindsight-platform.test.ts`. Expected: failures for bank/template/mental-model behavior.
- [ ] **Step 3: Implement the adapter and template.** Extend the client-like interface with `importTemplate`, `createMentalModel`, `getMentalModel`, and `getOperation`; use the installed Hindsight client where supported and its HTTP API for missing operations. Store the missions, directives, model source queries, and tag policy in `factory-bank-template.json`.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/integrations/hindsight.test.ts tests/integrations/hindsight-platform.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/integrations infra/hindsight tests/integrations && git commit -m "feat: add mission-aware hindsight memory"`

---

### Task 3: Make Pi resources filesystem-owned and reproducible

**Files:**
- Create: `infra/pi/resource-manifest.json`
- Create: `scripts/bootstrap-pi-resources.ts`
- Create: `src/agents/pi-resources.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Create: `tests/agents/pi-resources.test.ts`

**Interfaces:**
- `PiResourceManifest` declares package names/versions, source directories, and required `SKILL.md` paths.
- `bootstrapPiResources(manifest, destination)` installs the declared Pi packages into a factory-owned directory and verifies required files.
- `factoryResourceRoot()` resolves only the configured factory resource root, never a target repository resource directory.
- `assertRequiredSkills(root, paths)` fails before session creation when a skill is missing.

- [ ] **Step 1: Write failing resource tests.** Assert the manifest contains `pi-web-access`, `@dietrichgebert/ponytail`, `context-mode`, and Matt Pocock skill paths; verify missing files fail validation and valid resources resolve read-only.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/agents/pi-resources.test.ts`. Expected: failure because the manifest/bootstrap module is absent.
- [ ] **Step 3: Add the manifest and bootstrap command.** Pin package references using Pi’s package install format, copy/verify `src/agents/skills/engineering` from the repository, install into `PI_RESOURCE_ROOT`, and expose a `bootstrap:pi-resources` script. Never run installation during a workflow Activity.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/agents/pi-resources.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add infra/pi scripts src/agents/pi-resources.ts .env.example README.md tests/agents && git commit -m "feat: make pi resources filesystem reproducible"`

---

### Task 4: Add multi-provider Pi Web Access configuration

**Files:**
- Create: `src/integrations/pi-web-access.ts`
- Create: `infra/pi/web-search.json.example`
- Modify: `src/agents/tools.ts`
- Modify: `.env.example`
- Create: `tests/integrations/pi-web-access.test.ts`

**Interfaces:**
- `PiWebAccessConfig` supports `provider: "all"`, provider-labelled aggregation, explicit fallback routing, and redacted credential diagnostics.
- `createPiWebAccessTools(config)` returns search/fetch/source-check tools compatible with Pi `customTools`.
- Tool results preserve provider names and source URLs while removing API keys and authorization headers.

- [ ] **Step 1: Write failing configuration/tool tests.** Assert `provider: "all"`, configured provider arrays, independent provider failures, source labels, and credential redaction.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/integrations/pi-web-access.test.ts`. Expected: failure because the Pi Web Access adapter is absent.
- [ ] **Step 3: Implement configuration and tool bridge.** Load the factory-owned JSON config plus environment-backed keys, pass provider aggregation settings to Pi Web Access, and expose only the operations allowed by the role profile.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/integrations/pi-web-access.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/integrations src/agents/tools.ts infra/pi .env.example tests/integrations && git commit -m "feat: add multi-provider pi web access"`

---

### Task 5: Define role profiles and construct isolated Pi sessions

**Files:**
- Create: `src/agents/role-profiles.ts`
- Modify: `src/agents/gondolin-session.ts`
- Modify: `src/agents/pi-agent.ts`
- Modify: `src/temporal/activities/agent.ts`
- Create: `tests/agents/role-profiles.test.ts`
- Modify: `tests/agents/gondolin-session.test.ts`

**Interfaces:**
- `ROLE_PROFILES` defines exact skills, Pi tools, MCP/custom tools, Hindsight operations, web policy, and thinking level for `scout`, `plan`, `implement`, `repair`, and `review`.
- `profileForRole(role)` returns an immutable profile or rejects unknown roles.
- `createRoleSession(options)` creates a fresh `DefaultResourceLoader` with the factory resource root and role-specific extensions/skills.
- `PiAgentRunner` accepts a role profile and never derives permissions from the target repository.

- [ ] **Step 1: Write failing profile tests.** Assert exact capability sets, role isolation, unknown-role rejection, read-only resource root, and no shared loader/tool state across concurrent sessions.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/agents/role-profiles.test.ts tests/agents/gondolin-session.test.ts`. Expected: failure because role profiles and loader construction are absent.
- [ ] **Step 3: Implement profiles and session construction.** Create immutable role data, pass only allowed tools/custom tools to `createAgentSession`, load factory skills/extensions through `DefaultResourceLoader`, and keep Gondolin session creation unchanged as the isolation boundary.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/agents/role-profiles.test.ts tests/agents/gondolin-session.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/agents src/temporal/activities/agent.ts tests/agents && git commit -m "feat: add isolated role-specific pi sessions"`

---

### Task 6: Make agent Activities memory-aware and outcome-retaining

**Files:**
- Create: `src/temporal/activities/memory-context.ts`
- Modify: `src/temporal/activities/agent.ts`
- Modify: `src/temporal/activities/types.ts`
- Modify: `src/temporal/production-worker.ts`
- Create: `tests/temporal/memory-aware-agent.test.ts`

**Interfaces:**
- `buildMemoryContext(memory, input)` returns a bounded prompt context from tagged recall, reflect, and selected mental models.
- `runAgent(input)` recalls/reflection before Pi, passes the selected role profile, and retains the final output/outcome with the same correlation tags.
- Memory failures are classified: security/configuration failures stop the Activity; transient Hindsight failures produce an explicit `memoryUnavailable` marker for non-security-critical roles.

- [ ] **Step 1: Write failing Activity tests.** Assert recall/reflect/model calls happen before Pi, retain happens after Pi, tags include role/phase/run, context is bounded, and failure policy is enforced.
- [ ] **Step 2: Run focused tests.** Run `npm test -- --run tests/temporal/memory-aware-agent.test.ts`. Expected: failure because memory-aware orchestration is absent.
- [ ] **Step 3: Implement the memory context layer.** Assemble project-scoped Hindsight context, include evidence labels and uncertainty, pass it into the role prompt, and retain a structured outcome envelope asynchronously after the session finishes.
- [ ] **Step 4: Run focused tests and build.** Run `npm test -- --run tests/temporal/memory-aware-agent.test.ts && npm run build`.
- [ ] **Step 5: Commit.** `git add src/temporal/activities src/temporal/production-worker.ts tests/temporal && git commit -m "feat: add memory-aware agent activities"`

---

### Task 7: Verify complete role matrix and maintainability boundaries

**Files:**
- Create: `tests/integrations/agent-platform.test.ts`
- Modify: `tests/e2e/production-loop.test.ts`
- Modify: `README.md`
- Create: `docs/decisions/ADR-002-role-specific-agent-resources.md`
- Modify: `.env.example`

**Interfaces:**
- The integration harness can construct all five roles concurrently with fake Pi/Hindsight/web clients and inspect their immutable capability manifests.
- Documentation explains Koa startup, Hindsight bank bootstrap, resource bootstrap, provider configuration, and role capability boundaries.

- [ ] **Step 1: Write the matrix test.** Construct all five roles concurrently and assert distinct profiles, shared read-only factory resources, project-tagged memory, provider-labelled search, and no credential leakage.
- [ ] **Step 2: Run the matrix test.** Run `npm test -- --run tests/integrations/agent-platform.test.ts tests/e2e/production-loop.test.ts`. Expected: failure until all preceding boundaries are connected.
- [ ] **Step 3: Add the ADR and operational documentation.** Document why Koa, why organization/project Hindsight banks, why factory-owned resources, and why role-specific capabilities are mandatory.
- [ ] **Step 4: Run final verification.** Run `npm run test:run`, `npm run build`, and `git diff --check`.
- [ ] **Step 5: Commit.** `git add tests docs README.md .env.example && git commit -m "docs: document agent platform boundaries"`

---

## Final review checklist

- [ ] Koa owns HTTP lifecycle; no route parsing remains in raw `node:http` code.
- [ ] Hindsight missions, directives, mental models, recall, reflect, retain, and operation tracking are wired.
- [ ] All required factory skills and Pi packages are present in the filesystem manifest.
- [ ] Web access uses multi-provider aggregation with source labels and redacted credentials.
- [ ] Each role has an explicit immutable capability profile.
- [ ] Pi loaders are fresh per session and use only factory-owned resources.
- [ ] Agent Activities recall/reflection precede prompts and retain outcomes afterward.
- [ ] Full tests, TypeScript build, and `git diff --check` pass.
