import { join } from "node:path";

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
    skills: ["skills/engineering/research/SKILL.md", "skills/engineering/wayfinder/SKILL.md"],
    tools: ["read", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode"],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "medium",
  },
  plan: {
    skills: ["skills/engineering/codebase-design/SKILL.md", "skills/engineering/domain-modeling/SKILL.md", "skills/engineering/tdd/SKILL.md"],
    tools: ["read", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode", "ponytail"],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "high",
  },
  implement: {
    skills: ["skills/engineering/implement/SKILL.md", "skills/engineering/tdd/SKILL.md"],
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls", "context7"],
    extensions: ["context-mode", "ponytail"],
    mentalModels: ["repository-conventions", "test-failures"],
    hindsightOperations: ["recall", "retain"],
    webSearch: false,
    thinkingLevel: "medium",
  },
  repair: {
    skills: ["skills/engineering/diagnosing-bugs/SKILL.md", "skills/engineering/tdd/SKILL.md"],
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode", "ponytail"],
    mentalModels: ["test-failures", "repository-conventions"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "high",
  },
  review: {
    skills: ["skills/engineering/code-review/SKILL.md", "skills/engineering/diagnosing-bugs/SKILL.md"],
    tools: ["read", "grep", "find", "ls", "context7", "web_search"],
    extensions: ["pi-web-access", "context-mode", "ponytail"],
    mentalModels: ["architecture", "deployment-safety", "test-failures"],
    hindsightOperations: ["recall", "reflect", "retain"],
    webSearch: true,
    thinkingLevel: "high",
  },
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
