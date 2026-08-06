---
id: INV-POLICY-WORKFLOW
title: Policy-driven node attempts
requirements:
  - REQ-FACTORY-ORCHESTRATION
traces:
  - src/temporal/workflows/**
  - src/policy/**
---

Workflow execution records durable attempts and routes gate failures through repair instead of downstream build nodes.
