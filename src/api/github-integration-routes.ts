import Router from "@koa/router";
import type { Middleware } from "koa";
import { verifyGithubSignature } from "./github-webhook.js";
import type { GitHubAppService } from "../integrations/github-app.js";
import { RepositoryRequiredError } from "../tasks/intake-normalizer.js";

export interface GitHubIntegrationRoutesOptions {
  github?: GitHubAppService;
  webhookSecret?: string;
}

export function createGitHubWebhookMiddleware(options: GitHubIntegrationRoutesOptions): Middleware {
  return async (ctx, next) => {
    if (ctx.method !== "POST" || ctx.path !== "/webhooks/github") {
      await next();
      return;
    }
    if (!options.webhookSecret || !options.github) {
      ctx.status = 503;
      ctx.body = { schemaVersion: "error.v1", error: "GitHub webhook is not configured" };
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of ctx.req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    if (!verifyGithubSignature(options.webhookSecret, rawBody, ctx.get("x-hub-signature-256"))) {
      ctx.status = 401;
      ctx.body = { schemaVersion: "error.v1", error: "invalid signature" };
      return;
    }
    const event = ctx.get("x-github-event");
    if (!event) {
      ctx.status = 400;
      ctx.body = { schemaVersion: "error.v1", error: "missing event type" };
      return;
    }
    await options.github.handleWebhookEvent(event, JSON.parse(rawBody));
    ctx.status = 202;
    ctx.body = { accepted: true };
  };
}

export function mountGitHubIntegrationRoutes(
  router: Router,
  options: GitHubIntegrationRoutesOptions,
): void {
  router.get("/integrations/github/status", async (ctx) => {
    if (!options.github) {
      ctx.body = { schemaVersion: "github-status.v1", configured: false, connected: false, installations: [] };
      return;
    }
    ctx.body = { schemaVersion: "github-status.v1", ...(await options.github.getStatus()) };
  });

  router.get("/integrations/github/install", async (ctx) => {
    if (!options.github) {
      ctx.status = 503;
      ctx.body = { schemaVersion: "error.v1", error: "GitHub App is not configured" };
      return;
    }
    ctx.redirect(options.github.getInstallUrl(typeof ctx.query.state === "string" ? ctx.query.state : undefined));
  });

  router.get("/integrations/github/repos", async (ctx) => {
    if (!options.github) {
      ctx.status = 503;
      ctx.body = { schemaVersion: "error.v1", error: "GitHub App is not configured" };
      return;
    }
    const status = await options.github.getStatus();
    if (!status.connected) {
      ctx.status = 409;
      ctx.body = { schemaVersion: "error.v1", error: "GitHub App is not connected" };
      return;
    }
    const page = Number(ctx.query.page ?? "1");
    const perPage = Number(ctx.query.perPage ?? "50");
    const search = typeof ctx.query.search === "string" ? ctx.query.search : undefined;
    const result = await options.github.listRepositories({
      page: Number.isFinite(page) ? page : 1,
      perPage: Number.isFinite(perPage) ? perPage : 50,
      search,
    });
    ctx.body = {
      schemaVersion: "github-repos.v1",
      items: result.items,
      hasMore: result.hasMore,
    };
  });
}

export function repositoryValidationError(error: unknown): string | undefined {
  if (error instanceof RepositoryRequiredError) return error.message;
  if (error instanceof Error && /repository/i.test(error.message)) return error.message;
  return undefined;
}
