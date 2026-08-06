# ADR-005: 12-Factor Agents conformance

## Status

Accepted

## Context

The factory already owns Temporal control flow (factors 5, 6, 8, 11, 12). Per-role Pi harness work closes prompt, context, tool, error, and HITL gaps inside bounded agent nodes.

## Decision

Each role harness implements:

- **Factor 2** — versioned `prompts/system.md` injected as Pi system prompt; user turn is a structured `ContextPacket`.
- **Factor 3 / 13** — `buildContextPacket` assembles mission, task, predecessors, memory, errors, and evidence hints with per-role char budgets; activities pre-fetch memory before `session.prompt`.
- **Factor 7** — `escalate_to_human` terminal status on roles that may surface human decisions.
- **Factor 9** — `compactError` for tool/check failures included in context packets.
- **Factor 10** — single mission per role in harness spec and prompts.

## Consequences

New roles must add harness spec entries, prompts, bootstrap artifacts, and characterization tests before production use.
