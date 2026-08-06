---
id: REQ-EVIDENCE-SPINE
title: Append-only evidence persistence
acceptance:
  - AC-EVIDENCE-HASHING
blueprints:
  - INV-EVIDENCE-SPINE
traces:
  - src/evidence/**
  - src/db/migrations/002_evidence_spine.sql
---

Factory runs must persist append-only evidence metadata and content-addressed blobs.
