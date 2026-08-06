import { join } from "node:path";
import type { AgentRole } from "../contracts/nodes.js";

export interface RoleProfile {
  skills: readonly string[];
  mentalModels: readonly string[];
  hindsightOperations: readonly ("recall" | "reflect" | "retain")[];
  thinkingLevel: "low" | "medium" | "high";
}

export const ROLE_PROFILES: Record<AgentRole, RoleProfile> = {
  scout: {
    skills: ["src/agents/skills/engineering/research/SKILL.md", "src/agents/skills/engineering/wayfinder/SKILL.md"],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "medium",
  },
  plan: {
    skills: ["src/agents/skills/engineering/codebase-design/SKILL.md", "src/agents/skills/engineering/domain-modeling/SKILL.md", "src/agents/skills/engineering/tdd/SKILL.md"],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "high",
  },
  implement: {
    skills: ["src/agents/skills/engineering/implement/SKILL.md", "src/agents/skills/engineering/tdd/SKILL.md"],
    mentalModels: ["repository-conventions", "test-failures"],
    hindsightOperations: ["recall", "retain"],
    thinkingLevel: "medium",
  },
  repair: {
    skills: [
      "src/agents/skills/engineering/diagnosing-bugs/SKILL.md",
      "src/agents/skills/engineering/tdd/SKILL.md",
      "src/agents/skills/engineering/improve-codebase-architecture/SKILL.md",
    ],
    mentalModels: ["test-failures", "repository-conventions"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "high",
  },
  review: {
    skills: ["src/agents/skills/engineering/code-review/SKILL.md", "src/agents/skills/engineering/diagnosing-bugs/SKILL.md"],
    mentalModels: ["architecture", "deployment-safety", "test-failures"],
    hindsightOperations: ["recall", "reflect", "retain"],
    thinkingLevel: "high",
  },
  maintainability_critic: {
    skills: [
      "src/agents/skills/engineering/code-review/SKILL.md",
      "src/agents/skills/engineering/improve-codebase-architecture/SKILL.md",
    ],
    mentalModels: ["architecture", "repository-conventions", "project-history"],
    hindsightOperations: ["recall"],
    thinkingLevel: "high",
  },
};

export function profileForRole(role: string): RoleProfile {
  const profile = ROLE_PROFILES[role as AgentRole];
  if (!profile) throw new Error(`unknown Pi role: ${role}`);
  return profile;
}

export function roleLoaderOptions(role: string, resourceRoot: string): { agentDir: string; additionalSkillPaths: string[] } {
  const profile = profileForRole(role);
  return { agentDir: resourceRoot, additionalSkillPaths: profile.skills.map((skill) => join(resourceRoot, skill)) };
}

export function allRoleSkillPaths(): string[] {
  return [...new Set(Object.values(ROLE_PROFILES).flatMap((profile) => [...profile.skills]))];
}
