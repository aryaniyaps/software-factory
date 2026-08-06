# Proof-Carrying Lights-Off Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current production-only Temporal/Pi workflow into a self-hosted factory that accumulates typed evidence, verifies behavior and maintainability, releases through canaries, observes outcomes, and safely promotes, repairs, rolls back, or abstains.

**Architecture:** Temporal remains the durable authority. New assurance, evidence, policy, scenario, probe, telemetry, provenance and release modules communicate through versioned TypeScript contracts. PostgreSQL/object storage expose queryable evidence while isolated implementer and verifier sandboxes prevent oracle leakage.

**Tech Stack:** Node.js 24+, TypeScript, Temporal, Pi, Crabbox, Koa, PostgreSQL, Hindsight, OpenTelemetry, S3-compatible object storage, Vitest, Sentrux, dependency-cruiser, Knip, jscpd, StrykerJS.

## Global Constraints

- Implement [lights-off-architecture.md](../../software-factory/lights-off-architecture.md) and [maintainability-assurance.md](../../software-factory/maintainability-assurance.md).
- Temporal is workflow authority; PostgreSQL is a projection.
- No production boundary returns `unknown`.
- Every gate returns `pass`, `fail`, or `abstain` with immutable evidence references.
- Implementer cannot access hidden scenarios, probes, verifier prompts, or verifier credentials.
- All side effects are idempotent or fenced.
- Existing non-hard maintainability metrics run in shadow for the first 30 successful runs.
- No single static score or LLM judgment may decide maintainability.
- Use TDD, focused commits, and exact-path staging.

---

## Dependency order

```text
SF-01
  -> SF-02, SF-03
SF-01 + SF-02 + SF-03
  -> SF-04, SF-05, SF-06, SF-07
SF-01 + SF-03
  -> SF-08
SF-01 + SF-06 + SF-08
  -> SF-09
SF-02 + SF-08 + SF-09
  -> SF-10
SF-01 + SF-02 + SF-06 + SF-07
  -> SF-11
SF-11
  -> SF-12
SF-01 + SF-03 + SF-06 + SF-07 + SF-08 + SF-10
  -> SF-13
SF-01 + SF-02 + SF-03 + SF-04 + SF-05 + SF-07 + SF-11
  -> SF-14
SF-03 + SF-04 + SF-06 + SF-14
  -> SF-15
SF-08 + SF-10 + SF-13 + SF-15
  -> SF-16
SF-03 + SF-04 + SF-07 + SF-11 + SF-13 + SF-16
  -> SF-17
SF-03 + SF-04 + SF-14
  -> SF-18
```

## SF-01: Typed node, evidence, failure and gate contracts

**Files:**

- Create `src/contracts/evidence.ts`, `src/contracts/gates.ts`, `src/contracts/failures.ts`, `src/contracts/nodes.ts`
- Modify `src/temporal/activities/types.ts`, `src/temporal/workflows/types.ts`
- Test `tests/contracts/evidence.test.ts`, `tests/contracts/gates.test.ts`, `tests/temporal/activity-contracts.test.ts`

**Produces:** `NodeResult<T>`, `EvidenceItem`, `EvidenceRef`, `GateDecision`, `FailureEnvelope`, `FactoryRunState`, runtime TypeBox schemas and parsing helpers.

- [ ] Write schema tests that reject missing evidence, invalid decisions and unknown failure classes.
- [ ] Implement readonly TypeScript types and matching TypeBox schemas.
- [ ] Replace activity `unknown` outputs with role-specific discriminated outputs.
- [ ] Add version fields and stable serialization tests.
- [ ] Run `npm run build && npm run test:run`.
- [ ] Commit only contract and test paths with `feat: add typed factory evidence contracts`.

**Acceptance:** Production code has no `input: unknown`/`output: unknown` at workflow-agent boundaries; invalid agent JSON cannot progress a workflow.

## SF-02: Durable policy-driven workflow state machine

**Files:**

- Create `src/temporal/workflows/run-node.ts`, `src/temporal/workflows/repair-loop.ts`, `src/policy/retry-policy.ts`
- Modify `src/temporal/workflows/factory-workflow.ts`, `src/temporal/workflows/types.ts`
- Test `tests/temporal/factory-workflow.test.ts`, `tests/temporal/repair-loop.test.ts`, `tests/policy/retry-policy.test.ts`

**Produces:** durable node attempts, real retry/rerun signal transitions, bounded repair, typed failure classification, cancellation cleanup and `continueAsNew` state.

- [ ] Write Temporal test-environment cases for pass, retry, repair, abstain, cancellation and non-retryable policy failure.
- [ ] Replace `completedNodes` indexing with explicit current node and attempt history references.
- [ ] Make the rerun signal target a named node and create a new attempt.
- [ ] Implement policy-based attempt/time/token limits.
- [ ] Add compensating cleanup and idempotency keys.
- [ ] Run focused Temporal tests and the full suite.
- [ ] Commit with `feat: make factory workflow policy driven`.

**Acceptance:** A review/gate failure cannot fall through to build; every retry is visible as a distinct attempt; budget exhaustion returns `abstained`.

## SF-03: Append-only event and evidence persistence

**Files:**

- Create `src/db/migrations/002_evidence_spine.sql`, `src/evidence/evidence-store.ts`, `src/evidence/manifest.ts`, `src/evidence/object-store.ts`
- Modify `src/db/factory-projection.ts`, `src/config.ts`
- Test `tests/db/evidence-spine.test.ts`, `tests/evidence/manifest.test.ts`, `tests/evidence/object-store.test.ts`

**Produces:** normalized tables from the architecture spec, content-addressed object storage, evidence manifest builder and append-only projection API.

- [ ] Write migration tests including clean install and upgrade from current schema.
- [ ] Implement transactional event/outbox writes and unique idempotency constraints.
- [ ] Implement SHA-256 verification and S3-compatible blob storage.
- [ ] Prevent large transcript/blob bodies from entering PostgreSQL rows.
- [ ] Add manifest completeness and tamper-detection tests.
- [ ] Run database integration tests and full suite.
- [ ] Commit with `feat: add factory evidence spine`.

**Acceptance:** A manifest hash changes on any evidence mutation; duplicate events are idempotent; object/hash mismatch fails closed.

## SF-04: End-to-end OpenTelemetry instrumentation

**Files:**

- Create `src/telemetry/bootstrap.ts`, `src/telemetry/attributes.ts`, `src/telemetry/metrics.ts`, `infra/observability/otel-collector.yaml`, `infra/observability/grafana/`
- Modify server/worker entrypoints and deployment compose files
- Test `tests/telemetry/attributes.test.ts`, `tests/telemetry/workflow-spans.test.ts`

**Produces:** traces, metrics and structured logs correlated across Temporal, agent/tool, artifact, deployment, scenario and probe identifiers.

- [ ] Test required correlation attributes and secret redaction.
- [ ] Initialize OTel before Koa/Temporal/Pi imports.
- [ ] Instrument activities, agents, tools, sandboxes, gates, builds and deploys.
- [ ] Export Temporal worker metrics and evidence links.
- [ ] Add a development LGTM profile and dashboards for run health, cost, assurance and release outcomes.
- [ ] Verify a local smoke run produces a connected trace.
- [ ] Commit with `feat: instrument factory with opentelemetry`.

**Acceptance:** One trace links task intake through tool calls and deployment observation without including secrets or full source/transcript bodies.

## SF-05: Build provenance and sandbox hardening

**Files:**

- Create `src/security/capability-policy.ts`, `src/security/provenance.ts`, `src/security/sbom.ts`
- Modify `src/temporal/production-worker.ts`, `src/workspaces/crabbox-provider.ts`, `src/temporal/activities/build.ts`, package/container manifests
- Test `tests/security/capability-policy.test.ts`, `tests/security/provenance.test.ts`, `tests/activities/build.test.ts`

**Produces:** role-specific network/filesystem/credential capabilities, derived image digest, SBOM, signed provenance and build-once promotion contract.

- [ ] Test that configured digest differing from actual build output fails.
- [ ] Remove production `latest` versions and pin tool/container dependencies.
- [ ] Default sandbox network to none and apply explicit role allowlists.
- [ ] Derive digest from build output, generate SBOM/provenance and verify signature.
- [ ] Ensure verifier credentials differ from implementer credentials.
- [ ] Run build/security integration tests.
- [ ] Commit with `feat: harden factory supply chain`.

**Acceptance:** No environment-provided value can impersonate the built digest; the exact verified digest is the only deployable subject.

## SF-06: Repo-local requirements, blueprints and traceability

**Files:**

- Create `src/contracts/product-graph.ts`, `src/product-graph/loader.ts`, `src/product-graph/validator.ts`, `src/product-graph/coverage.ts`, `schemas/factory/*.json`
- Add example `factory/` contract for this repository
- Test `tests/product-graph/loader.test.ts`, `tests/product-graph/coverage.test.ts`

**Produces:** parsed `REQ/INV/AC/SCN/FIT/PRB` graph, forward/backward coverage and drift findings.

- [ ] Write fixtures for valid graph, dangling IDs, duplicate IDs, uncovered criteria and untraced code.
- [ ] Implement Markdown frontmatter/YAML schemas and stable IDs.
- [ ] Add work-order versioning and immutable run snapshot.
- [ ] Map changed files/symbols/tests/telemetry to graph nodes.
- [ ] Add CI command `npm run factory:contract:check`.
- [ ] Commit with `feat: add executable product contracts`.

**Acceptance:** Every acceptance criterion has scenario evidence and every consequential production change has an upstream requirement/invariant or repair finding.

## SF-07: Work classification, budgets and autonomy policy

**Files:**

- Create `src/policy/work-policy.ts`, `src/policy/risk-classifier.ts`, `src/policy/budget.ts`, `src/policy/policy-loader.ts`
- Modify task reconciler/client input
- Test `tests/policy/risk-classifier.test.ts`, `tests/policy/budget.test.ts`, `tests/policy/policy-loader.test.ts`

**Produces:** versioned T0-T3 policy, required gates/critics/probes, budget enforcement, repository concurrency and `abstain` behavior.

- [ ] Test deterministic high-risk rules for auth, migrations, destructive commands and public contracts.
- [ ] Implement schema-validated repo overrides with safe global defaults.
- [ ] Add per-repository/phase concurrency locks.
- [ ] Meter tokens, wall time, agent attempts and repair attempts.
- [ ] Persist classification evidence and policy version.
- [ ] Commit with `feat: add risk based autonomy policy`.

**Acceptance:** The same immutable inputs and policy version produce the same required assurance plan; exhausted budget never passes.

## SF-08: Deterministic maintainability fitness adapters

**Files:**

- Create `src/assurance/fitness/types.ts`, `src/assurance/fitness/runner.ts`, adapters under `src/assurance/fitness/adapters/`, and `factory/fitness/default.yaml`
- Modify package scripts/dependencies
- Test each adapter plus `tests/assurance/fitness/runner.test.ts`

**Produces:** language-neutral `FitnessAdapter`, TypeScript adapters for Sentrux, dependency-cruiser, TypeScript, ESLint, Knip, jscpd, Stryker and Git history, plus baseline/candidate delta reports.

- [ ] Write adapter contract and unsupported-language tests.
- [ ] Implement process execution with timeout, output caps and schema validation.
- [ ] Implement exact architecture rules and hard blocks before heuristic thresholds.
- [ ] Store raw sub-scores and findings; never only the aggregate.
- [ ] Run non-hard heuristics in 30-run shadow calibration mode.
- [ ] Commit with `feat: add maintainability fitness adapters`.

**Acceptance:** A new cycle/forbidden dependency blocks; Sentrux aggregate degradation alone does not; unavailable capability yields insufficient evidence where policy requires it.

## SF-09: Independent maintainability architecture critic

**Files:**

- Create `src/agents/roles/maintainability-critic.ts`, `src/assurance/maintainability/critic.ts`, `src/assurance/maintainability/findings.ts`
- Modify `src/agents/role-profiles.ts`, Pi agent output parsing
- Test `tests/assurance/maintainability/critic.test.ts`, `tests/agents/role-isolation.test.ts`

**Produces:** schema-valid smell/invariant findings, evidence validation, critic independence and high-risk disagreement handling.

- [ ] Add tests rejecting evidence-free blocking findings and implementer narrative leakage.
- [ ] Encode the complete smell taxonomy from the companion specification.
- [ ] Give critic read-only tools and immutable evidence inputs.
- [ ] Support two independent critics for T2/T3 policies.
- [ ] Convert disagreement into evidence expansion, not majority-pass.
- [ ] Commit with `feat: add independent maintainability critic`.

**Acceptance:** A blocking critic finding names concrete symbols/evidence/invariant and a falsification condition; aesthetic prose cannot block.

## SF-10: Maintainability assessment and refactoring controller

**Files:**

- Create `src/assurance/maintainability/report.ts`, `src/assurance/maintainability/policy.ts`, `src/temporal/workflows/maintainability-loop.ts`
- Modify factory workflow and repair role
- Test `tests/assurance/maintainability/policy.test.ts`, `tests/temporal/maintainability-loop.test.ts`

**Produces:** vector report, pass/repair/collect-evidence/abstain decisions and bounded small-step refactoring workflow.

- [ ] Test hard blocks, baseline regressions, warnings, contradictory evidence and exhausted attempts.
- [ ] Combine fitness/critic evidence without collapsing raw vector.
- [ ] Restrict repair writes to finding-related scope.
- [ ] Rerun behavior after every logical refactor batch.
- [ ] Preserve immutable acceptance criteria and hidden evaluators.
- [ ] Commit with `feat: add maintainability assurance loop`.

**Acceptance:** No single score or critic decides; refactoring that improves metrics but breaks behavior fails; unresolved contradiction abstains.

## SF-11: Clean-room scenario and holdout verifier

**Files:**

- Create `src/scenarios/types.ts`, `src/scenarios/loader.ts`, `src/scenarios/runner.ts`, `src/scenarios/satisfaction.ts`, verifier activity/worker
- Modify role profiles, task queues and workflow
- Test `tests/scenarios/runner.test.ts`, `tests/scenarios/isolation.test.ts`, `tests/scenarios/satisfaction.test.ts`

**Produces:** hidden read-only scenarios, separate verifier sandbox/identity, repeated trajectory evidence and satisfaction decision.

- [ ] Test implementer denial for hidden paths/credentials.
- [ ] Implement API/CLI/browser/contract/migration/failure/performance scenario adapters.
- [ ] Check behavior tests fail on base and pass on candidate; refactor tests pass on both.
- [ ] Store trajectories and repeated-run distributions.
- [ ] Return abstain for invalid/noisy scenarios rather than pass.
- [ ] Commit with `feat: add clean room behavioral verification`.

**Acceptance:** Candidate code cannot inspect or change its final oracle; each acceptance criterion links to observed trajectory evidence.

## SF-12: Dependency twins and fault simulation

**Files:**

- Create `src/simulation/twin.ts`, `src/simulation/registry.ts`, `src/simulation/faults.ts`, initial HTTP/webhook/storage twins
- Test `tests/simulation/twins.test.ts`, `tests/simulation/faults.test.ts`

**Produces:** deterministic, resettable, versioned dependency twins with latency/error/rate-limit/reordering/partial-failure scripts.

- [ ] Define behavioral contracts and state snapshot/reset.
- [ ] Implement record/replay fixtures with secret/PII redaction.
- [ ] Add deterministic clock/randomness and fault scripts.
- [ ] Integrate scenario runner and trajectory evidence.
- [ ] Add nightly simulation corpus.
- [ ] Commit with `feat: add dependency twins and fault simulation`.

**Acceptance:** Same seed/twin version produces the same dependency behavior; rare failures can be replayed without real external services.

## SF-13: Counterfactual future-change probe engine

**Files:**

- Create `src/probes/types.ts`, `src/probes/bank.ts`, `src/probes/validator.ts`, `src/probes/runner.ts`, `src/probes/comparator.ts`, probe Temporal workflow
- Test `tests/probes/validator.test.ts`, `tests/probes/runner.test.ts`, `tests/probes/comparator.test.ts`

**Produces:** hidden/versioned probe bank, matched base/candidate experiments, repeated runs, effect-size/confidence comparison and discarded worktrees.

- [ ] Test invalid, leaked, noisy, already-implemented and unequal-difficulty probes.
- [ ] Run identical model/tools/budget on base and candidate.
- [ ] Measure success, time, tokens, attempts, dispersion, API growth, regressions and context.
- [ ] Compare distributions with configured effect-size/confidence threshold.
- [ ] Destroy probe code/workspaces under all outcomes.
- [ ] Commit with `feat: add dynamic maintainability probes`.

**Acceptance:** Probe code is never mergeable; an invalid/noisy probe cannot fail a candidate; a significant candidate regression supplies reproducible evidence.

## SF-14: Preview, canary, observation and rollback controller

**Files:**

- Create `src/release/states.ts`, `src/release/canary-policy.ts`, `src/release/observation.ts`, `src/release/rollback.ts`, release Temporal workflow
- Modify deployment activities and main workflow
- Test `tests/release/state-machine.test.ts`, `tests/release/observation.test.ts`, `tests/release/rollback.test.ts`

**Produces:** immutable digest promotion, preview verification, canary stages, technical/semantic observation, idempotent rollback and delayed external completion.

- [ ] Write state transition and illegal-transition tests.
- [ ] Deploy preview and run release verifier as external client.
- [ ] Implement canary percentage/stage policy and observation windows.
- [ ] Link OTel/product signals to deployment and policy thresholds.
- [ ] Implement rollback fencing and observe rollback health.
- [ ] Mark GitHub task done only after promotion/observation.
- [ ] Commit with `feat: add autonomous release controller`.

**Acceptance:** Failed semantic or SLO observation rolls back the exact deployment; health endpoint alone cannot promote.

## SF-15: Incident and user-feedback return loop

**Files:**

- Create `src/feedback/types.ts`, `src/feedback/ingest.ts`, `src/feedback/cluster.ts`, `src/feedback/work-order.ts`, integration adapters
- Modify reconciler/API/projections
- Test `tests/feedback/ingest.test.ts`, `tests/feedback/cluster.test.ts`, `tests/feedback/work-order.test.ts`

**Produces:** normalized/deduplicated feedback, exact-source evidence, theme clusters, deployment correlation and generated traceable work orders.

- [ ] Implement idempotent GitHub/incident/webhook inputs.
- [ ] Link deployment IDs and source evidence.
- [ ] Cluster without losing verbatim evidence references.
- [ ] Generate work orders with requirements/acceptance IDs and risk classification.
- [ ] Feed rollback and incident outcome into oracle calibration.
- [ ] Commit with `feat: close production feedback loop`.

**Acceptance:** Any incident-derived task navigates back to incident, deployment, artifact and original run; duplicate webhooks create one item.

## SF-16: Longitudinal repository-health and oracle calibration

**Files:**

- Create `src/health/hotspots.ts`, `src/health/repository-health.ts`, `src/assurance/calibration.ts`, scheduled Temporal workflow
- Test `tests/health/hotspots.test.ts`, `tests/assurance/calibration.test.ts`

**Produces:** churn/co-change hotspots, broad nightly probe execution, debt work orders, prediction-vs-real-outcome calibration and versioned thresholds.

- [ ] Compute hotspots from version history without treating generated/vendor files as production.
- [ ] Join releases to later change effort, incidents, reverts and repeat findings.
- [ ] Evaluate oracle versions on held-out history and shadow runs.
- [ ] Create small targeted cleanup work orders only.
- [ ] Prevent evaluator self-promotion.
- [ ] Commit with `feat: add longitudinal repository health loop`.

**Acceptance:** Threshold changes contain evidence they predict real maintenance outcomes better; cleanup never bypasses normal behavioral/release gates.

## SF-17: Factory self-improvement and empirical model routing

**Files:**

- Create `src/evaluation/corpus.ts`, `src/evaluation/replay.ts`, `src/evaluation/validity.ts`, `src/models/weather-report.ts`, `src/models/router.ts`, meta-factory workflow
- Test `tests/evaluation/replay.test.ts`, `tests/evaluation/gaming.test.ts`, `tests/models/router.test.ts`

**Produces:** versioned regression corpus, held-out/gaming agents, shadow/canary promotion for factory changes and per-role model weather report.

- [ ] Build corpus from successful, failed, abstained, incident and maintenance cases.
- [ ] Add trivial/gaming agents to test evaluator outcome validity.
- [ ] Compare success, cost, variance, incident and maintainability effects.
- [ ] Route models by role/task/risk using evidence, not hardcoded rankings.
- [ ] Shadow and canary evaluator/prompt/model/tool/policy changes.
- [ ] Commit with `feat: add factory self improvement evaluation`.

**Acceptance:** A proposed evaluator cannot grade/promote itself; model routes include versioned empirical evidence and rollback.

## SF-18: Evidence and operations API/dashboard

**Files:**

- Create Koa routes/services for runs, attempts, evidence, gates, scenarios, probes, deployments and rollback; Grafana dashboards under `infra/observability/grafana/`
- Test route authorization, pagination, redaction and stable schemas

**Produces:** inspectable run graph and evidence without creating a second workflow authority.

- [ ] Expose read-only run/evidence graph with signed object URLs.
- [ ] Expose authorized cancel/rerun/rollback commands as Temporal signals.
- [ ] Implement pagination, retention and secret/PII redaction.
- [ ] Add dashboards for critical path, cost, assurance vector, scenario satisfaction, probes and deployment outcomes.
- [ ] Post concise GitHub task results with evidence links.
- [ ] Commit with `feat: expose factory evidence and operations`.

**Acceptance:** An operator can explain why a release passed, failed, abstained or rolled back from durable evidence; API writes never mutate projected workflow state directly.

## Final verification

- [ ] Run `npm run build`.
- [ ] Run `npm run test:run`.
- [ ] Run contract/architecture/security/mutation/scenario smoke commands introduced above.
- [ ] Execute one T1 success, one repair, one abstain and one canary rollback end to end.
- [ ] Verify traces, evidence manifest hashes, object references and GitHub status for each run.
- [ ] Confirm implementer cannot access hidden evaluator material.
- [ ] Confirm no production dependency/container version uses `latest`.
- [ ] Confirm every architecture acceptance criterion has a passing test or scenario reference.
