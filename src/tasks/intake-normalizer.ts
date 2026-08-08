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

export class RepositoryRequiredError extends Error {
  constructor() {
    super("repository is required; select a connected GitHub repository");
    this.name = "RepositoryRequiredError";
  }
}

export function normalizeTaskIntake(
  input: TaskIntakeInput,
  env: Record<string, string | undefined> = process.env,
): NormalizedTaskIntake {
  const prompt = input.prompt?.trim() || input.description?.trim() || "";
  if (!prompt) throw new Error("prompt is required");
  if (prompt.length > 100_000) throw new Error("prompt exceeds 100000 characters");

  const repository = normalizeRepositoryRef(input.repository?.trim() ?? "");
  if (!repository) throw new RepositoryRequiredError();
  assertSafeRepository(repository, env);

  const title = input.title?.trim() || inferTitle(prompt);
  return {
    prompt,
    repository,
    title,
    description: input.description?.trim() || prompt,
  };
}

export function normalizeRepositoryRef(repository: string): string {
  if (!repository) return "";
  if (repository.startsWith("https://") || repository.startsWith("/")) {
    return repository.endsWith(".git") || repository.startsWith("/")
      ? repository
      : `${repository}.git`;
  }
  const parts = repository.split("/").filter(Boolean);
  if (parts.length !== 2) return "";
  return `https://github.com/${parts[0]}/${parts[1]}.git`;
}

export function repositoryFullName(repository: string): string {
  if (repository.includes("/") && !repository.startsWith("https://") && !repository.startsWith("/")) {
    return repository;
  }
  try {
    const url = new URL(repository.endsWith(".git") ? repository : `${repository}.git`);
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return repository;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return repository;
  }
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

function inferTitle(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? prompt;
  const normalized = firstLine.replace(/^#+\s*/, "").replace(/\s+/g, " ");
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93).trimEnd()}…`;
}
