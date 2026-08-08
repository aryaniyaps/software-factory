# Temporal-Authoritative Execution Graph

## Status

Approved by the user for implementation.

## Goal

Make Temporal the sole application authority for the runtime factory graph and every execution record. Do not duplicate runs, nodes, agent turns, tool calls, evidence indexes, gates, scenarios, or deployments in application PostgreSQL.

## Authority boundary

Each factory execution has one stable Temporal Workflow ID. Temporal Visibility lists executions, Search Attributes expose filterable summary state, and a versioned Workflow Query returns the complete renderable execution view: nodes, edges, attempts, current state, clarifications, agent/tool descriptors, evidence references, gates, scenarios, deployments, and outcome.

The workflow owns graph topology. The dashboard renders nodes and edges supplied by the query and contains no independent topology registry. Operator commands are validated inside the workflow and submitted as Temporal messages.

Large evidence, transcript, and tool input/output bodies remain content-addressed in the filesystem object store. Temporal stores their hashes, URIs, redaction metadata, and lifecycle. This is separation by payload type, not a second execution database.

Application PostgreSQL retains only GitHub App installations and A2A task envelopes. Temporal's private persistence database remains an implementation detail and is never queried by application code.

## Runtime behavior

- Workflow protocol 3 exposes `factoryExecutionView`, returning `factory-execution-view.v2`.
- Search Attributes identify the execution contract, repository, status, current node, workflow kind, and risk tier.
- Activities return execution descriptors instead of writing projections.
- Agent tool calls are recorded with stable identifiers and content-addressed input/output references. A started call without a terminal record is visibly interrupted.
- Continue-As-New carries the compact execution view at safe stage boundaries.
- The supported completed-execution window is 90 days. There is no archive read path.

## API cutover

The old run, factory-run, evidence-projection, incident, and feedback routes are removed. The replacement API starts, lists, queries, and commands `/executions`; it serves only objects referenced by the queried Temporal execution.

Pre-protocol-3 executions remain inspectable in Temporal Web until retention expiry but are excluded from the new API. Existing PostgreSQL execution rows are intentionally not migrated.

## Verification

Tests cover query topology and status, attempt/call lifecycle and deduplication, Continue-As-New, Visibility pagination, workflow-side command validation, object authorization, dynamic dashboard rendering, the reduced schema, destructive migration, and an end-to-end execution with no PostgreSQL execution writes.
