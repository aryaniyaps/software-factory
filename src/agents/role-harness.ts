import { join } from "node:path";
import type { AgentRole } from "../contracts/nodes.js";

export interface McpServerSpec {
  readonly id: string;
  readonly allowedTools: readonly string[];
}

export type TerminalStatus = "succeeded" | "failed" | "abstained" | "escalate_to_human";

export interface RoleHarnessSpec {
  readonly role: AgentRole;
  readonly mission: string;
  readonly skills: readonly string[];
  readonly mentalModels: readonly string[];
  readonly hindsightOperations: readonly ("recall" | "reflect" | "retain")[];
  readonly thinkingLevel: "low" | "medium" | "high";
  readonly builtinTools: readonly string[];
  readonly mcpServers: readonly McpServerSpec[];
  readonly extensions: readonly string[];
  readonly webAccess: boolean;
  readonly systemPromptPath: string;
  readonly contextBudgetChars: number;
  readonly maxConsecutiveToolErrors: number;
  readonly terminalStatuses: readonly TerminalStatus[];
}

const CONTEXT7_SERVER: McpServerSpec = {
  id: "context7",
  allowedTools: ["resolve-library-id", "query-docs"],
};

const FACTORY_EVIDENCE_REVIEW: McpServerSpec = {
  id: "factory-evidence",
  allowedTools: ["get_evidence", "list_evidence_meta"],
};

const FACTORY_EVIDENCE_CRITIC: McpServerSpec = {
  id: "factory-evidence",
  allowedTools: ["get_evidence"],
};

const READ_ONLY_BUILTINS = ["read", "grep", "find", "ls"] as const;
const SCOUT_PLAN_BUILTINS = [...READ_ONLY_BUILTINS, "web_search"] as const;
const IMPLEMENT_BUILTINS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;
const REPAIR_BUILTINS = [...IMPLEMENT_BUILTINS, "web_search"] as const;
const REVIEW_BUILTINS = [...READ_ONLY_BUILTINS, "web_search"] as const;
const CRITIC_BUILTINS = [...READ_ONLY_BUILTINS] as const;

const ESCALATE_TERMINALS: TerminalStatus[] = ["succeeded", "failed", "abstained", "escalate_to_human"];
const STANDARD_TERMINALS: TerminalStatus[] = ["succeeded", "failed", "abstained"];

export const ROLE_HARNESS_SPECS: Record<AgentRole, RoleHarnessSpec> = {
  scout: {
    role: "scout",
    mission: "Map repository reality for this ticket without writing code or inventing requirements.",
    skills: [
      "src/agents/skills/engineering/research/SKILL.md",
      "src/agents/skills/engineering/wayfinder/SKILL.md",
    ],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "medium",
    builtinTools: SCOUT_PLAN_BUILTINS,
    mcpServers: [CONTEXT7_SERVER],
    extensions: ["gondolin", "mcp-bridge"],
    webAccess: true,
    systemPromptPath: "prompts/system.md",
    contextBudgetChars: 24_000,
    maxConsecutiveToolErrors: 3,
    terminalStatuses: ESCALATE_TERMINALS,
  },
  plan: {
    role: "plan",
    mission: "Produce an actionable plan and acceptance checks from scout output and the task.",
    skills: [
      "src/agents/skills/engineering/codebase-design/SKILL.md",
      "src/agents/skills/engineering/domain-modeling/SKILL.md",
      "src/agents/skills/engineering/tdd/SKILL.md",
    ],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "high",
    builtinTools: SCOUT_PLAN_BUILTINS,
    mcpServers: [CONTEXT7_SERVER],
    extensions: ["gondolin", "mcp-bridge"],
    webAccess: true,
    systemPromptPath: "prompts/system.md",
    contextBudgetChars: 28_000,
    maxConsecutiveToolErrors: 3,
    terminalStatuses: ESCALATE_TERMINALS,
  },
  implement: {
    role: "implement",
    mission: "Apply the approved plan in the worktree using TDD without redesigning product scope.",
    skills: [
      "src/agents/skills/engineering/implement/SKILL.md",
      "src/agents/skills/engineering/tdd/SKILL.md",
    ],
    mentalModels: ["repository-conventions", "test-failures"],
    hindsightOperations: ["recall", "retain"],
    thinkingLevel: "medium",
    builtinTools: IMPLEMENT_BUILTINS,
    mcpServers: [CONTEXT7_SERVER],
    extensions: ["gondolin", "mcp-bridge"],
    webAccess: false,
    systemPromptPath: "prompts/system.md",
    contextBudgetChars: 32_000,
    maxConsecutiveToolErrors: 3,
    terminalStatuses: STANDARD_TERMINALS,
  },
  repair: {
    role: "repair",
    mission: "Fix failing checks or scoped maintainability debt without broad refactors outside failure scope.",
    skills: [
      "src/agents/skills/engineering/diagnosing-bugs/SKILL.md",
      "src/agents/skills/engineering/tdd/SKILL.md",
      "src/agents/skills/engineering/improve-codebase-architecture/SKILL.md",
    ],
    mentalModels: ["test-failures", "repository-conventions"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "high",
    builtinTools: REPAIR_BUILTINS,
    mcpServers: [CONTEXT7_SERVER],
    extensions: ["gondolin", "mcp-bridge"],
    webAccess: true,
    systemPromptPath: "prompts/system.md",
    contextBudgetChars: 32_000,
    maxConsecutiveToolErrors: 3,
    terminalStatuses: ESCALATE_TERMINALS,
  },
  review: {
    role: "review",
    mission: "Gate on correctness, security, regressions, and maintainability without fixing code.",
    skills: [
      "src/agents/skills/engineering/code-review/SKILL.md",
      "src/agents/skills/engineering/diagnosing-bugs/SKILL.md",
    ],
    mentalModels: ["architecture", "deployment-safety", "test-failures"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "high",
    builtinTools: REVIEW_BUILTINS,
    mcpServers: [CONTEXT7_SERVER, FACTORY_EVIDENCE_REVIEW],
    extensions: ["gondolin", "mcp-bridge"],
    webAccess: true,
    systemPromptPath: "prompts/system.md",
    contextBudgetChars: 28_000,
    maxConsecutiveToolErrors: 3,
    terminalStatuses: ESCALATE_TERMINALS,
  },
  maintainability_critic: {
    role: "maintainability_critic",
    mission: "Emit a fitness/critic report from immutable evidence without trusting implementer narrative.",
    skills: [
      "src/agents/skills/engineering/code-review/SKILL.md",
      "src/agents/skills/engineering/improve-codebase-architecture/SKILL.md",
    ],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall"],
    thinkingLevel: "high",
    builtinTools: CRITIC_BUILTINS,
    mcpServers: [CONTEXT7_SERVER, FACTORY_EVIDENCE_CRITIC],
    extensions: ["gondolin", "mcp-bridge"],
    webAccess: false,
    systemPromptPath: "prompts/system.md",
    contextBudgetChars: 28_000,
    maxConsecutiveToolErrors: 3,
    terminalStatuses: STANDARD_TERMINALS,
  },
};

export function harnessForRole(role: string): RoleHarnessSpec {
  const spec = ROLE_HARNESS_SPECS[role as AgentRole];
  if (!spec) throw new Error(`unknown Pi role: ${role}`);
  return spec;
}

export type RoleAgentDirLayout = "bootstrapped" | "repo";

export function roleAgentDir(resourceRoot: string, role: string, layout: RoleAgentDirLayout = "repo"): string {
  return layout === "bootstrapped"
    ? join(resourceRoot, "roles", role)
    : join(resourceRoot, "infra/pi/roles", role);
}

export function roleSystemPromptFile(resourceRoot: string, role: string): string {
  const spec = harnessForRole(role);
  return join(roleAgentDir(resourceRoot, role), spec.systemPromptPath);
}

export function mcpToolsForRole(role: string): string[] {
  return harnessForRole(role).mcpServers.flatMap((server) => [...server.allowedTools]);
}

export function allToolsForRole(role: string): string[] {
  const spec = harnessForRole(role);
  return [...spec.builtinTools, ...mcpToolsForRole(role)];
}

export function roleLoaderOptions(role: string, resourceRoot: string): { agentDir: string; additionalSkillPaths: string[] } {
  return { agentDir: roleAgentDir(resourceRoot, role, "bootstrapped"), additionalSkillPaths: [] };
}

export function allRoleSkillPaths(): string[] {
  return [...new Set(Object.values(ROLE_HARNESS_SPECS).flatMap((spec) => [...spec.skills]))];
}

export function canEscalateToHuman(role: string): boolean {
  return harnessForRole(role).terminalStatuses.includes("escalate_to_human");
}
