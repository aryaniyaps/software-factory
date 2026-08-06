# ADR-002: Role-Specific Agent Resources

## Status

Accepted

## Context

The factory uses Pi sessions for judgment inside Gondolin. A single mutable agent configuration would make tool access, skills, web access, and memory behavior implicit and difficult to audit. Target repositories are untrusted and must not be able to replace factory guidance or credentials.

## Decision

The factory owns a versioned Pi resource manifest and installs it into a dedicated filesystem directory. Gondolin mounts that directory read-only. Every Pi session creates a fresh `DefaultResourceLoader` with only the selected role's skill paths, tools, extensions, Hindsight mental models, and web policy.

Hindsight is scoped to organization/project banks. Repository, run, role, and phase tags provide isolation inside a bank. Missions, directives, and mental models are bootstrapped from versioned repository configuration. Agent outputs are retained with idempotent correlation document IDs.

Pi Web Access is used instead of a custom web-search provider. Its multi-provider aggregation preserves source attribution and provider failures, while credentials remain in the worker environment.

Koa owns HTTP parsing and lifecycle; it does not schedule Temporal work or execute repository code.

## Consequences

- Capability review is a data change in `src/agents/role-profiles.ts` (skills, memory policy) and `src/agents/tool-policy.ts` (Pi tool allowlists), not scattered conditional logic.
- Adding a skill or package requires a manifest and filesystem verification.
- Hindsight context is richer and reusable across repositories without mixing run-specific memories.
- Role sessions are slightly more expensive because loaders and memory packets are not shared.
- Provider availability and Hindsight outages must be represented explicitly in agent context rather than hidden behind unsafe fallbacks.
