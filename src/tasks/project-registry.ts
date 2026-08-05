import type { FactoryTask } from "./task-provider.js";

export interface ProjectRule {
  repository: string;
  deploymentProfile: string;
  sandboxProfile: string;
  defaultBranch: string;
}

export class ProjectRegistry {
  constructor(private readonly rules: ProjectRule[]) {}

  resolve(repository: string, task: Omit<FactoryTask, "repository" | "deploymentProfile" | "sandboxProfile" | "baseBranch">): FactoryTask {
    const rule = this.rules.find((candidate) => candidate.repository === repository);
    if (!rule) throw new Error(`unknown repository: ${repository}`);
    return { ...task, repository, baseBranch: rule.defaultBranch, deploymentProfile: rule.deploymentProfile, sandboxProfile: rule.sandboxProfile };
  }
}
