---
id: REQ-EVIDENCE-SPINE
title: Content-addressed execution evidence
acceptance:
  - AC-EVIDENCE-HASHING
blueprints:
  - INV-EVIDENCE-SPINE
traces:
  - src/evidence/**
  - src/db/schema.ts
  - src/contracts/execution.ts
---

Factory executions must place large evidence bodies in content-addressed object storage and keep their hash-verified references in Temporal Workflow state.

## Authority boundary

PostgreSQL must not contain execution evidence metadata or indexes. Objects may be returned only when the requested object identifier appears in the queried execution view.
