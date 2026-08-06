# ADR-004: MCP governance for factory Pi harnesses

## Status

Accepted

## Context

Per-role Pi harnesses connect to upstream MCP servers (Context7, factory-evidence). Tool access must be deny-by-default with auditability. Microsoft AGT [MCP Security Gateway 1.0](https://microsoft.github.io/agent-governance-toolkit/specs/MCP-SECURITY-GATEWAY-1.0/) defines allowlist, sanitize, and audit semantics.

## Decision

1. **In-process AGT semantics** — `src/agents/mcp-gateway.ts` implements deny-by-default allowlist checks and audit logging on every MCP tool invocation. Role allowlists are declared in `src/agents/role-harness.ts` and materialized to `roles/<role>/policy/mcp-gateway.yaml` during bootstrap.

2. **Allowlist-only registration** — `PiAgentRunner` registers only tools present in the role harness spec. MCP tools are bridged via `context7-mcp-tools.ts` and `factory-evidence-tools.ts`, not ad-hoc `customTool` wrappers.

3. **Intercept fallback** — For deployments requiring transport-level policy enforcement, [PolicyLayer Intercept](https://github.com/PolicyLayer/Intercept/) can proxy MCP HTTP traffic as a sidecar. The in-process gateway remains the source of truth for role allowlists; Intercept is a defense-in-depth layer, not a substitute for harness data.

4. **SDK upgrade path** — Future integration with `@microsoft/agent-governance-sdk` or `@microsoft/agentmesh-mcp-governance` should replace the thin `McpSecurityGateway` wrapper without changing role harness data.

## Consequences

- Tool denials are explicit errors with audit entries.
- Adding an MCP server requires harness spec + bootstrap policy updates.
- github-readonly and browser MCP remain deferred.
