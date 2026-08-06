---
id: REQ-EVIDENCE-SPINE
title: Append-only evidence persistence
acceptance:
  - AC-EVIDENCE-HASHING
blueprints:
  - INV-EVIDENCE-SPINE
traces:
  - src/evidence/**
  - src/db/schema.ts
  - src/db/factory-projection.ts
  - drizzle/0000_soft_otto_octavius.sql
---

Factory runs must persist append-only evidence metadata and content-addressed blobs.

## Schema ownership

Evidence projection tables are defined in `src/db/schema.ts` and applied through generated Drizzle migrations under `drizzle/`. Schema changes require `npm run db:generate`, review of the generated SQL, and `npm run db:migrate` against a reset factory database during cutovers.
