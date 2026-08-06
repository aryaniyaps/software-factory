# 12-Factor Agents conformance (factory)

Reference: [humanlayer/12-factor-agents](https://github.com/humanlayer/12-factor-agents)

| Factor | Factory implementation |
|--------|------------------------|
| 1 NL → tool calls | Allowlist-only Pi tools; typed `agent-output.v1` envelope |
| 2 Own prompts | `infra/pi/roles/<role>/prompts/system.md` injected via Pi `systemPrompt` |
| 3 Own context window | `src/agents/context-packet.ts` structured sections with per-role budgets |
| 4 Tools = structured outputs | MCP gateway + `parseAgentOutput` validation |
| 5 Unify exec + business state | Temporal + Postgres projection (unchanged) |
| 6 Launch/pause/resume | Temporal signals: cancel, rerun, rollback (unchanged) |
| 7 Contact humans with tools | `escalate_to_human` terminal on scout/plan/repair/review |
| 8 Own control flow | Temporal DAG owns loops; Pi sessions are single-node |
| 9 Compact errors | `src/agents/compact-error.ts` in repair context + tool failures |
| 10 Small focused agents | Six roles with separate `roles/<role>/` agentDirs |
| 11 Trigger from anywhere | API + GitHub reconciler (unchanged) |
| 12 Stateless reducer | Each `runAgent` = pre-built context → envelope |
| 13 Pre-fetch context | Activity assembles memory, predecessors, errors before `session.prompt` |

## Checklist for new roles

1. Add `RoleHarnessSpec` entry in `role-harness.ts`
2. Bootstrap layout under `infra/pi/roles/<role>/`
3. Write `prompts/system.md` with PE structure
4. Update characterization tests in `tests/agents/role-harness.test.ts`
