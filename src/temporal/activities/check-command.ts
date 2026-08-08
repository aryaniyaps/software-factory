import { access } from "node:fs/promises";
import { join } from "node:path";

export interface CheckCommand {
  command: string;
  args: string[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveCheckCommand(worktreePath: string): Promise<CheckCommand> {
  if (await pathExists(join(worktreePath, "go.mod"))) {
    return { command: "go", args: ["test", "./...", "-count=1"] };
  }
  if (await pathExists(join(worktreePath, "package.json"))) {
    return { command: "npm", args: ["test", "--", "--run"] };
  }
  throw new Error(`no supported test runner found in worktree: ${worktreePath}`);
}

export async function resolvePrimaryLanguage(worktreePath: string): Promise<string> {
  if (await pathExists(join(worktreePath, "go.mod"))) return "go";
  if (await pathExists(join(worktreePath, "package.json"))) return "typescript";
  return "unknown";
}
