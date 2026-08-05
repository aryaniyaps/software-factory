import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitWorktreeManager } from "../../src/workspaces/worktree-manager.js";

const exec = promisify(execFile);

async function repository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "factory-repo-"));
  await exec("git", ["init", "-q", path]);
  await exec("git", ["-C", path, "config", "user.email", "test@example.com"]);
  await exec("git", ["-C", path, "config", "user.name", "Factory Test"]);
  await writeFile(join(path, "README.md"), "test\n");
  await exec("git", ["-C", path, "add", "."]);
  await exec("git", ["-C", path, "commit", "-qm", "initial"]);
  return path;
}

describe("GitWorktreeManager", () => {
  it("creates and removes an isolated worktree", async () => {
    const repo = await repository();
    const root = await mkdtemp(join(tmpdir(), "factory-worktrees-"));
    const manager = new GitWorktreeManager(root);

    const worktree = await manager.create({ repository: repo, runId: "run/1", ticketId: "ticket-1", attemptId: "attempt-1" });
    expect(worktree.branch).toBe("factory/run-1/ticket-1/attempt-1");
    expect(worktree.path).toContain(root);

    await manager.remove(worktree.path);
  });

  it("rejects path traversal components", async () => {
    const manager = new GitWorktreeManager("/tmp/worktrees");
    await expect(manager.create({ repository: "/tmp/repo", runId: "../bad", ticketId: "ticket", attemptId: "attempt" })).rejects.toThrow("unsafe identifier");
  });
});
