import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

function safePart(value: string): string {
  if (!value || value.includes("..")) throw new Error("unsafe identifier");
  const result = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!result) throw new Error("unsafe identifier");
  return result;
}

export class GitWorktreeManager {
  private readonly repositories = new Map<string, string>();

  constructor(private readonly root: string) {}

  async create(input: { repository: string; runId: string; ticketId: string; attemptId: string }): Promise<{ path: string; branch: string }> {
    const runId = safePart(input.runId);
    const ticketId = safePart(input.ticketId);
    const attemptId = safePart(input.attemptId);
    const branch = `factory/${runId}/${ticketId}/${attemptId}`;
    const path = join(this.root, runId, ticketId, attemptId);
    await mkdir(join(this.root, runId, ticketId), { recursive: true });
    await run("git", ["-C", input.repository, "worktree", "add", "-b", branch, path]);
    this.repositories.set(path, input.repository);
    return { path, branch };
  }

  async remove(path: string): Promise<void> {
    const repository = this.repositories.get(path);
    if (!repository) throw new Error(`unknown worktree: ${path}`);
    await run("git", ["-C", repository, "worktree", "remove", "--force", path]);
    this.repositories.delete(path);
  }
}
