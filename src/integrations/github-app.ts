import { readFile } from "node:fs/promises";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type { GitHubInstallationStore } from "../db/github-installation-store.js";

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  slug: string;
  apiUrl?: string;
  bootstrapInstallationId?: number;
}

export interface GitHubRepositorySummary {
  fullName: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface GitHubIntegrationStatus {
  configured: boolean;
  connected: boolean;
  installations: Array<{
    installationId: number;
    accountLogin: string;
    accountType: string;
    suspended: boolean;
  }>;
}

export interface GitHubAppService {
  isConfigured(): boolean;
  getInstallUrl(state?: string): string;
  handleWebhookEvent(event: string, payload: unknown): Promise<void>;
  getStatus(): Promise<GitHubIntegrationStatus>;
  listRepositories(input?: {
    search?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ items: GitHubRepositorySummary[]; hasMore: boolean }>;
  installationTokenForRepo(fullName: string): Promise<string | undefined>;
  validateRepositoryAccessible(fullName: string): Promise<boolean>;
  bootstrapFromEnv(): Promise<void>;
}

interface InstallationWebhookPayload {
  action?: string;
  installation?: {
    id?: number;
    suspended_at?: string | null;
    account?: { login?: string; type?: string };
  };
}

export async function loadGitHubAppConfig(
  env: Record<string, string | undefined> = process.env,
): Promise<GitHubAppConfig | undefined> {
  const appId = env.GITHUB_APP_ID?.trim();
  const slug = env.GITHUB_APP_SLUG?.trim();
  const webhookSecret = env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!appId || !slug || !webhookSecret) return undefined;

  let privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!privateKey && env.GITHUB_APP_PRIVATE_KEY_PATH?.trim()) {
    privateKey = (await readFile(env.GITHUB_APP_PRIVATE_KEY_PATH.trim(), "utf8")).trim();
  }
  if (!privateKey) return undefined;

  const bootstrapInstallationId = env.GITHUB_APP_INSTALLATION_ID?.trim()
    ? Number(env.GITHUB_APP_INSTALLATION_ID.trim())
    : undefined;

  return {
    appId,
    privateKey,
    webhookSecret,
    slug,
    apiUrl: env.GITHUB_API_URL?.trim() || undefined,
    bootstrapInstallationId: Number.isFinite(bootstrapInstallationId) ? bootstrapInstallationId : undefined,
  };
}

export function createGitHubAppService(
  config: GitHubAppConfig,
  installations: GitHubInstallationStore,
): GitHubAppService {
  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
  });

  async function appOctokit(): Promise<Octokit> {
    const { token } = await auth({ type: "app" });
    return new Octokit({
      auth: token,
      ...(config.apiUrl ? { baseUrl: config.apiUrl } : {}),
    });
  }

  async function installationOctokit(installationId: number): Promise<Octokit> {
    const authResult = await auth({ type: "installation", installationId });
    return new Octokit({
      auth: authResult.token,
      ...(config.apiUrl ? { baseUrl: config.apiUrl } : {}),
    });
  }

  return {
    isConfigured() {
      return true;
    },

    getInstallUrl(state?: string) {
      const base = `https://github.com/apps/${config.slug}/installations/new`;
      return state ? `${base}?state=${encodeURIComponent(state)}` : base;
    },

    async handleWebhookEvent(event, payload) {
      const body = payload as InstallationWebhookPayload;
      if (event === "installation") {
        const installation = body.installation;
        if (!installation?.id || !installation.account?.login || !installation.account.type) return;
        if (body.action === "deleted") {
          await installations.remove(installation.id);
          return;
        }
        if (body.action === "created" || body.action === "suspend" || body.action === "unsuspend") {
          await installations.upsert({
            installationId: installation.id,
            accountLogin: installation.account.login,
            accountType: installation.account.type,
            suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
          });
        }
      }
    },

    async getStatus() {
      const rows = await installations.listActive();
      return {
        configured: true,
        connected: rows.length > 0,
        installations: rows.map((row) => ({
          installationId: row.installationId,
          accountLogin: row.accountLogin,
          accountType: row.accountType,
          suspended: row.suspendedAt != null,
        })),
      };
    },

    async listRepositories(input = {}) {
      const page = Math.max(1, input.page ?? 1);
      const perPage = Math.min(100, Math.max(1, input.perPage ?? 50));
      const search = input.search?.trim().toLowerCase() ?? "";
      const active = await installations.listActive();
      const collected: GitHubRepositorySummary[] = [];
      let remoteHasMore = false;

      for (const installation of active) {
        const octokit = await installationOctokit(installation.installationId);
        let githubPage = 1;
        while (collected.length < page * perPage + 1) {
          const response = await octokit.rest.apps.listReposAccessibleToInstallation({
            per_page: 100,
            page: githubPage,
          });
          for (const repo of response.data.repositories) {
            if (!repo.full_name || !repo.clone_url) continue;
            if (search && !repo.full_name.toLowerCase().includes(search)) continue;
            collected.push({
              fullName: repo.full_name,
              cloneUrl: repo.clone_url,
              private: repo.private,
              defaultBranch: repo.default_branch ?? "main",
            });
          }
          const pageHasMore = response.data.repositories.length === 100;
          remoteHasMore ||= pageHasMore;
          if (!pageHasMore) break;
          githubPage += 1;
          if (githubPage > 20) break;
        }
      }

      const unique = [...new Map(collected.map((repo) => [repo.fullName, repo])).values()]
        .sort((left, right) => left.fullName.localeCompare(right.fullName));
      const start = (page - 1) * perPage;
      const items = unique.slice(start, start + perPage);
      return { items, hasMore: start + perPage < unique.length || remoteHasMore };
    },

    async installationTokenForRepo(fullName) {
      const [owner] = fullName.split("/", 2);
      if (!owner) return undefined;
      const active = await installations.listActive();
      for (const installation of active) {
        const octokit = await installationOctokit(installation.installationId);
        try {
          await octokit.rest.repos.get({ owner, repo: fullName.split("/", 2)[1] ?? "" });
          const authResult = await auth({ type: "installation", installationId: installation.installationId });
          return authResult.token;
        } catch {
          continue;
        }
      }
      return undefined;
    },

    async validateRepositoryAccessible(fullName) {
      const normalized = fullName.trim();
      if (!normalized.includes("/")) return false;
      const repos = await this.listRepositories({ search: normalized, perPage: 100 });
      return repos.items.some((repo) => repo.fullName.toLowerCase() === normalized.toLowerCase());
    },

    async bootstrapFromEnv() {
      if (!config.bootstrapInstallationId) return;
      const existing = await installations.listActive();
      if (existing.some((row) => row.installationId === config.bootstrapInstallationId)) return;
      const octokit = await appOctokit();
      const response = await octokit.rest.apps.getInstallation({
        installation_id: config.bootstrapInstallationId,
      });
      const installation = response.data;
      if (!installation.account || !("login" in installation.account) || !installation.account.type) {
        throw new Error(`unable to bootstrap GitHub installation ${config.bootstrapInstallationId}`);
      }
      await installations.upsert({
        installationId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
      });
    },
  };
}

export function repositoryFullNameFromCloneUrl(repository: string): string | undefined {
  if (!repository.startsWith("https://")) return undefined;
  try {
    const url = new URL(repository.endsWith(".git") ? repository : `${repository}.git`);
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return undefined;
  }
}
