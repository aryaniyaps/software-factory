# ADR-004: MCP governance for Pi role harnesses

## Status

Accepted

## Context

Factory agents expose MCP-backed tools (Context7, factory-evidence) alongside Pi builtins. Allowlists alone are insufficient for audit trails and future policy expansion.

## Decision

Apply Microsoft Agent Governance Toolkit MCP Security Gateway 1.0 semantics in-process via `McpSecurityGateway` (deny-by-default allowlist, per-call audit). Pi registers only tools present in the role harness spec. Context7 is migrated from ad-hoc `customTool` wiring to named MCP tools (`resolve-library-id`, `query-docs`). Factory-evidence tools are in-process for `review` and `maintainability_critic`.

[PolicyLayer Intercept](https://github.com/PolicyLayer/Intercept/) remains the documented transport-proxy fallback when MCP traffic must be mediated outside the Node worker.

## Consequences

- Tool exposure is reviewable in `src/agents/role-harness.ts` and per-role `mcp/servers.json`.
- Adding MCP servers requires harness, gateway policy, and bridge registration updates.
- Full `@microsoft/agent-governance-sdk` integration can replace the lightweight gateway when SDK MCP mediation matures for our transport mix.
