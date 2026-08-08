# ADR-006: Use Temporal as the execution graph authority

## Status

Accepted

## Context

The factory currently orchestrates work in Temporal while duplicating run, node, event, agent-session, tool-call, evidence, gate, scenario, and deployment state into application PostgreSQL. The duplicate model can drift, creates ghost rows when workflow start fails, and forces the dashboard to combine PostgreSQL state with a hard-coded graph.

## Decision

Temporal is the sole application source of truth for runtime graph topology and execution metadata.

- Temporal Visibility and Search Attributes provide execution lists and filters.
- A versioned Workflow Query provides the complete renderable execution view.
- Workflow messages validate and apply operator commands.
- Activities return or durably report execution descriptors to the workflow; they do not write execution projections.
- Large bodies live only in content-addressed object storage, with authoritative hashes and references in Temporal.
- Application PostgreSQL stores only GitHub installations and A2A task envelopes.
- Completed executions are supported for 90 days; archival is not part of the product contract.

## Alternatives considered

### Parse raw Event History for every API read

Rejected because it couples the product API to Temporal event internals and makes routine dashboard reads expensive and brittle.

### Model every node and tool call as a child workflow

Rejected because the added cancellation, retry, and lifecycle surface does not improve authority. A workflow-owned graph and call ledger preserve the required invariant with less machinery.

### Keep PostgreSQL read projections

Rejected because the user explicitly does not want redundant run, node, or call storage.

## Consequences

- Workflow code and its query contract must remain replay-compatible for the full retention window.
- A compatible worker must be available to query running or closed workflows.
- Temporal history growth is controlled with compact descriptors and Continue-As-New.
- The application PostgreSQL migration intentionally destroys legacy execution projections without migrating them.
- Temporal's own persistence database remains private infrastructure, not an application read model.
