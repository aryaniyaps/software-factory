---
id: REQ-PRODUCT-GRAPH
title: Repo-local executable product contracts
acceptance:
  - AC-SCENARIO-COVERAGE
  - AC-TRACEABILITY-GATE
blueprints:
  - INV-PRODUCT-GRAPH
traces:
  - src/product-graph/**
  - src/contracts/product-graph.ts
  - schemas/factory/**
  - factory/**
---

Managed repositories must declare requirements, invariants, acceptance criteria and scenario evidence in versioned repo-local files.
