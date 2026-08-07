import { isIP } from "node:net";

export interface TaskIntakeInput {
  prompt?: string;
  repository?: string;
  title?: string;
  description?: string;
}

export interface NormalizedTaskIntake {
  prompt: string;
  repository: string;
  title: string;
  description: string;
}

export class RepositoryUnresolvedError extends Error {
  constructor() {
    super("repository could not be inferred; configure FACTORY_DEFAULT_REPOSITORY or include a repository URL");
    this.name = "RepositoryUnresolvedError";
  }
}

export function normalizeTaskIntake(
  input: TaskIntakeInput,
  env: Record<string, string | undefined> = process.env,
): NormalizedTaskIntake {
  const prompt = input.prompt?.trim() || input.description?.trim() || "";
  if (!prompt) throw new Error("prompt is required");
  if (prompt.length > 100_000) throw new Error("prompt exceeds 100000 characters");

  const repository = input.repository?.trim()
    || repositoryFromPrompt(prompt)
    || env.FACTORY_DEFAULT_REPOSITORY?.trim()
    || env.FACTORY_REPO_ROOT?.trim();
  if (!repository) throw new RepositoryUnresolvedError();
  assertSafeRepository(repository, env);

  const title = input.title?.trim() || inferTitle(prompt);
  return {
    prompt,
    repository,
    title,
    description: input.description?.trim() || prompt,
  };
}

function assertSafeRepository(
  repository: string,
  env: Record<string, string | undefined>,
): void {
  if (!repository.startsWith("https://")) return;
  const url = new URL(repository);
  if (url.username || url.password || isIP(url.hostname)) {
    throw new Error("repository URL must not contain credentials or an IP address");
  }
  const allowedHosts = (env.FACTORY_REPOSITORY_HOSTS ?? "github.com,gitlab.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`repository host is not allowed: ${url.hostname}`);
  }
}

function repositoryFromPrompt(prompt: string): string | undefined {
  return prompt.match(/https:\/\/[^\s)]+(?:\.git)?/i)?.[0];
}

function inferTitle(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? prompt;
  const normalized = firstLine.replace(/^#+\s*/, "").replace(/\s+/g, " ");
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93).trimEnd()}…`;
}
