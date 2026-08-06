# Typed Factory Evidence Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add versioned runtime-validated contracts so invalid evidence, gate, failure, and agent results cannot advance the factory workflow.

**Architecture:** TypeBox schemas are closed runtime contracts and exported TypeScript types are readonly. Each contract module exposes a throwing parser; boundary code parses before returning data. A small recursive canonical JSON serializer provides deterministic snapshots without introducing a serialization dependency.

**Tech Stack:** TypeScript 5+, TypeBox, Vitest, Temporal activity/workflow type definitions.

## Global Constraints

- Temporal remains the durable workflow authority.
- Every node output must carry evidence references or an explicit failure/abstention outcome.
- Invalid agent JSON must fail closed and cannot progress a workflow.
- Do not redesign workflow retries or persistence in SF-01; those belong to dependent issues.
- Do not add dependencies.
- Run `npm run build && npm run test:run` before completion.

## File Map

- Create `src/contracts/evidence.ts`: evidence refs/items and canonical serialization.
- Create `src/contracts/gates.ts`: gate decisions and reasons.
- Create `src/contracts/failures.ts`: closed failure classes and envelopes.
- Create `src/contracts/nodes.ts`: node results, run state, role-specific agent contracts.
- Modify `src/temporal/activities/types.ts`: typed agent activity inputs/outputs.
- Modify `src/temporal/workflows/types.ts`: shared run state/node names from contracts.
- Create `tests/contracts/evidence.test.ts`: evidence validation and serialization.
- Create `tests/contracts/gates.test.ts`: gate validation.
- Create `tests/temporal/activity-contracts.test.ts`: boundary contract typing/parsing.

---

### Task 1: Evidence contracts

**Files:**
- Create: `src/contracts/evidence.ts`
- Test: `tests/contracts/evidence.test.ts`

**Interfaces:**
- Produces readonly `EvidenceRef`, `EvidenceItem`, `EvidenceKind`, `RedactionLevel`.
- Produces `parseEvidenceRef(value: unknown): EvidenceRef` and `parseEvidenceItem(value: unknown): EvidenceItem`.
- Produces `stableSerialize(value: unknown): string`.

- [ ] **Step 1: Write failing tests** for valid evidence, missing `sha256`, unknown properties, missing refs, and stable serialization independent of key insertion order.
- [ ] **Step 2: Run `npx vitest run tests/contracts/evidence.test.ts` and verify failure.**
- [ ] **Step 3: Implement closed TypeBox schemas, readonly types, parsers, and recursive key-sorting serializer.** Use `Value.Check`/`Value.Errors` from TypeBox's runtime API; parsers throw an error containing the first validation path and message.
- [ ] **Step 4: Run the focused evidence tests and verify pass.**
- [ ] **Step 5: Commit:** `git add src/contracts/evidence.ts tests/contracts/evidence.test.ts && git commit -m "feat: add evidence contracts"`.

---

### Task 2: Gate and failure contracts

**Files:**
- Create: `src/contracts/gates.ts`
- Create: `src/contracts/failures.ts`
- Test: `tests/contracts/gates.test.ts`

**Interfaces:**
- Produces `Decision = "pass" | "fail" | "abstain"`.
- Produces readonly `GateReason`, `GateDecision`, `FailureEnvelope`.
- Produces `parseGateDecision(value: unknown): GateDecision` and `parseFailureEnvelope(value: unknown): FailureEnvelope`.

- [ ] **Step 1: Write failing tests** for all valid decisions, missing evidence refs, unknown decision values, all allowed failure classes, and unknown failure classes.
- [ ] **Step 2: Run `npx vitest run tests/contracts/gates.test.ts` and verify failure.**
- [ ] **Step 3: Implement closed TypeBox schemas with literal unions and parsers.** Failure classes are exactly `transient`, `tool`, `policy`, `security`, `invalid_input`, `budget`, and `unknown`; retryability remains explicit on the envelope.
- [ ] **Step 4: Run focused gate/failure tests and verify pass.**
- [ ] **Step 5: Commit:** `git add src/contracts/gates.ts src/contracts/failures.ts tests/contracts/gates.test.ts && git commit -m "feat: add gate and failure contracts"`.

---

### Task 3: Node and agent boundary contracts

**Files:**
- Create: `src/contracts/nodes.ts`
- Modify: `src/temporal/activities/types.ts`
- Modify: `src/temporal/workflows/types.ts`
- Test: `tests/temporal/activity-contracts.test.ts`

**Interfaces:**
- Produces `FactoryNodeName`, `NodeResult<T>`, `FactoryRunState`.
- Produces discriminated `AgentActivityInput` and role-specific `AgentActivityResult` output types for `scout`, `plan`, `implement`, `repair`, and `review`.
- Produces parsers for node/run/agent payloads where runtime JSON crosses the boundary.

- [ ] **Step 1: Write failing tests** asserting role-specific input/output discrimination, invalid agent JSON rejection, required evidence refs on node results, and stable version fields.
- [ ] **Step 2: Run `npx vitest run tests/temporal/activity-contracts.test.ts` and verify failure.**
- [ ] **Step 3: Implement `nodes.ts` using the shared node-name tuple and contract schemas.** Preserve existing role names and existing workflow call shape; replace only `unknown` boundary fields with typed unions and validated parsers.
- [ ] **Step 4: Update activity/workflow type imports and declarations; ensure no workflow-agent boundary uses `input: unknown` or `output: unknown`.**
- [ ] **Step 5: Run focused contract tests and `npm run build`; verify pass.**
- [ ] **Step 6: Commit:** `git add src/contracts/nodes.ts src/temporal/activities/types.ts src/temporal/workflows/types.ts tests/temporal/activity-contracts.test.ts && git commit -m "feat: add typed factory node contracts"`.

---

### Task 4: Regression verification and issue evidence

**Files:**
- No production files beyond Tasks 1–3.

- [ ] **Step 1: Run `npm run build`.** Expected: TypeScript compilation succeeds.
- [ ] **Step 2: Run `npm run test:run`.** Expected: all existing and new tests pass.
- [ ] **Step 3: Search production boundary types:** `rg 'input: unknown|output: unknown' src/temporal src/agents src/workflow`; expected no workflow-agent boundary matches.
- [ ] **Step 4: Inspect the diff:** `git diff main...HEAD -- src/contracts src/temporal/activities/types.ts src/temporal/workflows/types.ts tests/contracts tests/temporal/activity-contracts.test.ts`; expected only SF-01 paths plus the committed design/plan docs.
- [ ] **Step 5: Post exact validation evidence on issue #2 and close it only if every acceptance criterion passes.**
