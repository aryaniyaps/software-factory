# Typed Factory Evidence Contracts Design

## Goal

Make workflow and agent boundaries fail closed with versioned, readonly TypeScript contracts for nodes, evidence, gates, and failures.

## Approach

Use TypeBox schemas as the runtime source of truth and expose throwing `parse*` helpers. Schemas are closed objects with literal discriminators; invalid agent JSON throws before it can advance a workflow. Types remain readonly, and version fields are explicit on persisted contract values.

A small canonical JSON serializer will sort object keys recursively so stable serialization tests do not depend on construction order. It will be used only for contract snapshots and hashes, not as a general serialization framework.

## Contracts

- `src/contracts/evidence.ts`: `EvidenceItem`, `EvidenceRef`, producer/subject metadata, schema versions, and parsers.
- `src/contracts/gates.ts`: `Decision`, `GateReason`, `GateDecision`, strict decision/evidence requirements, and parsers.
- `src/contracts/failures.ts`: closed failure classes and `FailureEnvelope`, including retryability and evidence references.
- `src/contracts/nodes.ts`: `FactoryNodeName`, `NodeResult<T>`, `FactoryRunState`, and role-specific discriminated agent input/output contracts.
- `src/temporal/activities/types.ts` and `src/temporal/workflows/types.ts`: replace workflow-agent boundary `unknown` values with the new contracts without redesigning workflow behavior.

## Validation and testing

Tests cover missing evidence, invalid decisions, unknown failure classes, unknown object fields, stable serialization, and invalid agent JSON. Focused tests run before the full build and test suite.

This design intentionally does not implement the durable policy state machine, append-only persistence, or retry policy; those belong to later dependent workstreams.
