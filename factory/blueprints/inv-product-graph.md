---
id: INV-PRODUCT-GRAPH
title: Product graph is bidirectionally traceable
requirements:
  - REQ-PRODUCT-GRAPH
traces:
  - src/product-graph/**
  - src/contracts/product-graph.ts
  - schemas/factory/**
---

The factory validates forward and backward coverage for repo-local product contracts.
