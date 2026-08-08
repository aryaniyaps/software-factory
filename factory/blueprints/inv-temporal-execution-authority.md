---
id: INV-TEMPORAL-EXECUTION-AUTHORITY
title: Temporal owns execution truth
requirements:
  - REQ-TEMPORAL-EXECUTION-AUTHORITY
traces:
  - src/agents/**
  - src/api/**
  - src/config.ts
  - src/contracts/execution.ts
  - src/contracts/nodes.ts
  - src/db/**
  - src/feedback/**
  - src/server-main.ts
  - src/temporal/**
  - apps/dashboard/src/**
  - drizzle/**
---

Temporal Workflow state is the sole authority for execution topology, attempts, agent turns, tool calls, gates, and outcomes. PostgreSQL contains only control-plane records for GitHub installations and A2A tasks; large execution bodies live in content-addressed object storage and are reachable only through references held by the Workflow.
