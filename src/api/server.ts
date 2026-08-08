import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import type { FeedbackApiStore } from "./feedback-api.js";
import { incidentInputFromBody, webhookInputFromBody } from "./feedback-api.js";
import { createAuthMiddleware } from "./auth.js";
import { mountEvidenceRoutes } from "./evidence-routes.js";
import type { EvidenceService } from "./evidence-service.js";
import type { OperationsService } from "./operations-service.js";
import type { SignedUrlConfig } from "./signed-urls.js";
import {
  normalizeTaskIntake,
  repositoryFullName,
  type TaskIntakeInput,
} from "../tasks/intake-normalizer.js";
import type { GitHubAppService } from "../integrations/github-app.js";
import {
  createGitHubWebhookMiddleware,
  mountGitHubIntegrationRoutes,
  repositoryValidationError,
} from "./github-integration-routes.js";

export interface ApiStore {
  createTask(input: { repository: string; title: string; description: string }): Promise<string>;
  getRun(id: string): Promise<unknown>;
  getEvents?(id: string): Promise<unknown[]>;
  cancelRun(id: string): Promise<void>;
  feedback?: FeedbackApiStore;
}

export interface ApiAppOptions {
  store: ApiStore;
  evidenceService?: EvidenceService;
  operationsService?: OperationsService;
  signedUrls?: SignedUrlConfig;
  apiToken?: string;
  github?: GitHubAppService;
  githubWebhookSecret?: string;
}

export function createApiApp(options: ApiAppOptions): Koa {
  const app = new Koa();
  const router = new Router();

  app.use(createGitHubWebhookMiddleware({
    github: options.github,
    webhookSecret: options.githubWebhookSecret,
  }));
  app.use(createAuthMiddleware({
    token: options.apiToken,
    publicPaths: ["/webhooks/github", "/integrations/github/install"],
  }));
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      ctx.status = 400;
      ctx.body = { schemaVersion: "error.v1", error: error instanceof Error ? error.message : String(error) };
    }
  });
  app.use(bodyParser());

  mountGitHubIntegrationRoutes(router, {
    github: options.github,
    webhookSecret: options.githubWebhookSecret,
  });

  router.post("/tasks", async (ctx) => {
    const input = (ctx.request.body ?? {}) as TaskIntakeInput;
    let normalized;
    try {
      normalized = normalizeTaskIntake(input);
      if (options.github) {
        const status = await options.github.getStatus();
        if (!status.connected) {
          ctx.status = 409;
          ctx.body = { schemaVersion: "error.v1", error: "GitHub App is not connected" };
          return;
        }
        const accessible = await options.github.validateRepositoryAccessible(repositoryFullName(normalized.repository));
        if (!accessible) {
          ctx.status = 422;
          ctx.body = {
            schemaVersion: "error.v1",
            error: `repository is not accessible via the connected GitHub App: ${repositoryFullName(normalized.repository)}`,
          };
          return;
        }
      }
    } catch (error) {
      ctx.status = 422;
      ctx.body = {
        schemaVersion: "error.v1",
        error: repositoryValidationError(error) ?? (error instanceof Error ? error.message : String(error)),
      };
      return;
    }
    const id = await options.store.createTask(normalized);
    ctx.status = 201;
    ctx.body = { id };
  });

  router.get("/runs/:id", async (ctx) => {
    const run = await options.store.getRun(ctx.params.id);
    ctx.status = run ? 200 : 404;
    ctx.body = run ?? { schemaVersion: "error.v1", error: "run not found" };
  });

  router.get("/runs/:id/events", async (ctx) => {
    ctx.body = await options.store.getEvents?.(ctx.params.id) ?? [];
  });

  router.post("/runs/:id/cancel", async (ctx) => {
    await options.store.cancelRun(ctx.params.id);
    ctx.body = { status: "cancelled" };
  });

  router.post("/feedback", async (ctx) => {
    if (!options.store.feedback) {
      ctx.status = 501;
      ctx.body = { schemaVersion: "error.v1", error: "feedback ingest not configured" };
      return;
    }
    const deliveryId = (ctx.request.headers["x-delivery-id"] as string | undefined) ?? randomUUID();
    const body = (ctx.request.body ?? {}) as Partial<{ externalId: string; summary: string; body: string; runId: string; incidentId: string; artifactDigest: string }>;
    if (!body.summary || !body.body || !body.runId) {
      ctx.status = 422;
      ctx.body = { schemaVersion: "error.v1", error: "summary, body, and runId are required" };
      return;
    }
    const input = webhookInputFromBody(body as { summary: string; body: string; runId: string; externalId?: string; incidentId?: string; artifactDigest?: string }, deliveryId);
    const result = await options.store.feedback.ingestFeedback(input);
    ctx.status = result.inserted ? 201 : 200;
    ctx.body = result;
  });

  router.post("/incidents", async (ctx) => {
    if (!options.store.feedback) {
      ctx.status = 501;
      ctx.body = { schemaVersion: "error.v1", error: "feedback ingest not configured" };
      return;
    }
    const deliveryId = (ctx.request.headers["x-delivery-id"] as string | undefined) ?? randomUUID();
    const body = (ctx.request.body ?? {}) as Partial<{ incidentId: string; summary: string; body: string; runId: string; artifactDigest: string; outcome: "rollback" | "resolved" | "open"; deliveryId: string }>;
    if (!body.incidentId || !body.summary || !body.body || !body.runId) {
      ctx.status = 422;
      ctx.body = { schemaVersion: "error.v1", error: "incidentId, summary, body, and runId are required" };
      return;
    }
    const input = incidentInputFromBody(body as { incidentId: string; summary: string; body: string; runId: string; artifactDigest?: string; outcome?: "rollback" | "resolved" | "open"; deliveryId?: string }, deliveryId);
    const result = await options.store.feedback.ingestFeedback(input);
    ctx.status = result.inserted ? 201 : 200;
    ctx.body = result;
  });

  router.get("/feedback/:id/trace", async (ctx) => {
    if (!options.store.feedback) {
      ctx.status = 501;
      ctx.body = { schemaVersion: "error.v1", error: "feedback ingest not configured" };
      return;
    }
    const trace = await options.store.feedback.getFeedbackTrace(ctx.params.id);
    ctx.status = trace ? 200 : 404;
    ctx.body = trace ?? { schemaVersion: "error.v1", error: "feedback not found" };
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  if (options.evidenceService && options.operationsService && options.signedUrls) {
    mountEvidenceRoutes(app, {
      evidenceService: options.evidenceService,
      operationsService: options.operationsService,
      signedUrls: options.signedUrls,
    });
  }

  app.use((ctx) => {
    ctx.status = 404;
    ctx.body = { schemaVersion: "error.v1", error: "not found" };
  });
  return app;
}

export function createApiServer(options: ApiAppOptions): Server {
  return createServer(createApiApp(options).callback());
}
