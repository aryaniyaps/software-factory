import type { FactoryActivities, RepositoryPreparation, WorktreeResult } from "./types.js";
import type { FactoryWorkflowInput } from "../client.js";

export interface RepositoryGit {
  prepare(repository: string): Promise<RepositoryPreparation>;
}

export interface RepositoryWorktrees {
  create(input: { repository: string; runId: string; ticketId: string; attemptId: string }): Promise<WorktreeResult>;
  remove(path: string): Promise<void>;
}

export function createRepositoryActivities(dependencies: { git: RepositoryGit; worktrees: RepositoryWorktrees }): Pick<FactoryActivities, "prepareRepository" | "createWorktree"> & { removeWorktree(path: string): Promise<void> } {
  return {
    async prepareRepository(input: FactoryWorkflowInput) {
      if (!isSupportedRepository(input.repository)) throw new Error("repository must be local or HTTPS");
      return dependencies.git.prepare(input.repository);
    },
    createWorktree: (input) => dependencies.worktrees.create({
      repository: input.preparation.repository,
      runId: input.runId,
      ticketId: input.taskId,
      attemptId: input.attemptId ?? "1",
    }),
    async removeWorktree(path) {
      try {
        await dependencies.worktrees.remove(path);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("unknown worktree:")) throw error;
      }
    },
  };
}

function isSupportedRepository(repository: string): boolean {
  return repository.startsWith("https://") || (repository.startsWith("/") && !repository.includes(".."));
}
