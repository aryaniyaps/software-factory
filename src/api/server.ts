import { createServer, type Server } from "node:http";
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import { createAuthMiddleware } from "./auth.js";
import { mountEvidenceRoutes } from "./evidence-routes.js";
import type { EvidenceService } from "./evidence-service.js";
import type { OperationsService } from "./operations-service.js";
import type { SignedUrlConfig } from "./signed-urls.js";

export interface ApiStore {
  createTask(input: { repository: string; title: string; description: string }): Promise<string>;
  getRun(id: string): Promise<unknown>;
  getEvents?(id: string): Promise<unknown[]>;
  cancelRun(id: string): Promise<void>;
}

export interface ApiAppOptions {
  store: ApiStore;
  evidenceService?: EvidenceService;
  operationsService?: OperationsService;
  signedUrls?: SignedUrlConfig;
  apiToken?: string;
}

type TaskInput = Partial<{ repository: string; title: string; description: string }>;

export function createApiApp(options: ApiAppOptions): Koa {
  const app = new Koa();
  const router = new Router();

  app.use(createAuthMiddleware({ token: options.apiToken }));
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      ctx.status = 400;
      ctx.body = { schemaVersion: "error.v1", error: error instanceof Error ? error.message : String(error) };
    }
  });
  app.use(bodyParser());

  router.post("/tasks", async (ctx) => {
    const input = (ctx.request.body ?? {}) as TaskInput;
    if (!input.repository || !input.title || !input.description) {
      ctx.status = 422;
      ctx.body = { schemaVersion: "error.v1", error: "repository, title, and description are required" };
      return;
    }
    const id = await options.store.createTask(input as { repository: string; title: string; description: string });
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
