---
id: AC-ATTEMPT-HISTORY
title: Node attempts are distinct and durable
requirements:
  - REQ-FACTORY-ORCHESTRATION
scenarios:
  - SCN-ATTEMPT-HISTORY
---

Retries must create distinct attempt records instead of mutating a completed node list.
