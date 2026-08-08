---
id: REQ-FACTORY-ORCHESTRATION
title: Durable factory workflow orchestration
acceptance:
  - AC-POLICY-GATE-ROUTING
  - AC-ATTEMPT-HISTORY
blueprints:
  - INV-POLICY-WORKFLOW
traces:
  - src/temporal/**
  - src/workspaces/crabbox-runtime.ts
---

The factory must execute managed work through a durable Temporal workflow with explicit node attempts.
