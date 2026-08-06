import { join } from "node:path";
import { maintainabilityCriticPrompt } from "./roles/maintainability-critic.js";
import { maintainabilityRefactorPrompt } from "./roles/repair.js";

export interface RoleProfile {
  skills: readonly string[];
  tools: readonly string[];
  extensions: readonly string[];
  mentalModels: readonly string[];
  hindsightOperations: readonly ("recall" | "reflect" | "retain")[];
  webSearch: boolean;
  thinkingLevel: "low" | "medium" | "high";
}

export const ROLE_PROFILES: Record<string, RoleProfile> = {
  scout: {
    skills: ["src/agents/skills/engineering/research/SKILL.md", "src/agents/skills/engineering/wayfinder/SKILL.md"],
    tools: ["read", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode"],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "medium",
  },
  plan: {
    skills: ["src/agents/skills/engineering/codebase-design/SKILL.md", "src/agents/skills/engineering/domain-modeling/SKILL.md", "src/agents/skills/engineering/tdd/SKILL.md"],
    tools: ["read", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode", "ponytail"],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "high",
  },
  implement: {
    skills: ["src/agents/skills/engineering/implement/SKILL.md", "src/agents/skills/engineering/tdd/SKILL.md"],
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls", "context7"],
    extensions: ["context-mode", "ponytail"],
    mentalModels: ["repository-conventions", "test-failures"],
    hindsightOperations: ["recall", "retain"],
    webSearch: false,
    thinkingLevel: "medium",
  },
  repair: {
    skills: [
      "src/agents/skills/engineering/diagnosing-bugs/SKILL.md",
      "src/agents/skills/engineering/tdd/SKILL.md",
      "src/agents/skills/engineering/improve-codebase-architecture/SKILL.md",
    ],
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode", "ponytail"],
    mentalModels: ["test-failures", "repository-conventions"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "high",
  },
  review: {
    skills: ["src/agents/skills/engineering/code-review/SKILL.md", "src/agents/skills/engineering/diagnosing-bugs/SKILL.md"],
    tools: ["read", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode", "ponytail"],
    mentalModels: ["architecture", "deployment-safety", "test-failures"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "high",
  },
  maintainability_critic: {
    skills: [
      "src/agents/skills/engineering/code-review/SKILL.md",
      "src/agents/skills/engineering/improve-codebase-architecture/SKILL.md",
    ],
    tools: ["read", "grep", "find", "ls", "context7"],
    extensions: ["context-mode"],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall"],
    webSearch: false,
    thinkingLevel: "high",
  },
  behavior_verifier: {
    skills: ["src/agents/skills/engineering/tdd/SKILL.md"],
    tools: ["read", "grep", "find", "ls"],
    extensions: ["context-mode"],
    mentalModels: ["test-failures", "deployment-safety"],
    hindsightOperations: ["recall"],
    webSearch: false,
    thinkingLevel: "medium",
  },
};

export const ROLE_PROMPT_HINTS: Partial<Record<string, string>> = {
  maintainability_critic: maintainabilityCriticPrompt,
  repair: maintainabilityRefactorPrompt,
};

export function profileForRole(role: string): RoleProfile {
  const profile = ROLE_PROFILES[role];
  if (!profile) throw new Error(`unknown Pi role: ${role}`);
  return profile;
}

export function roleLoaderOptions(role: string, resourceRoot: string): { agentDir: string; additionalSkillPaths: string[] } {
  const profile = profileForRole(role);
  return { agentDir: resourceRoot, additionalSkillPaths: profile.skills.map((skill) => join(resourceRoot, skill)) };
}
