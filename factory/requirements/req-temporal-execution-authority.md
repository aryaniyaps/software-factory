---
id: REQ-TEMPORAL-EXECUTION-AUTHORITY
title: Temporal-authoritative execution state
acceptance:
  - AC-TEMPORAL-EXECUTION-AUTHORITY
blueprints:
  - INV-TEMPORAL-EXECUTION-AUTHORITY
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

Protocol-3 executions must expose their versioned graph and complete execution view through Temporal Workflow Queries. Application APIs and the dashboard must read that view instead of a relational projection. PostgreSQL must retain only GitHub installation and A2A task records.
