import { createServer, type Server } from "node:http";
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";

export interface ApiStore {
  createTask(input: { repository: string; title: string; description: string; dependencies?: string[] }): Promise<string>;
  getRun(id: string): Promise<unknown>;
  getEvents?(id: string): Promise<unknown[]>;
  cancelRun(id: string): Promise<void>;
  retryNode(id: string): Promise<void>;
}

type TaskInput = Partial<{ repository: string; title: string; description: string; dependencies: string[] }>;

export function createApiApp(store: ApiStore): Koa {
  const app = new Koa();
  const router = new Router();

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      ctx.status = 400;
      ctx.body = { error: error instanceof Error ? error.message : String(error) };
    }
  });
  app.use(bodyParser());

  router.post("/tasks", async (ctx) => {
    const input = (ctx.request.body ?? {}) as TaskInput;
    if (!input.repository || !input.title || !input.description) {
      ctx.status = 422;
      ctx.body = { error: "repository, title, and description are required" };
      return;
    }
    const id = await store.createTask(input as { repository: string; title: string; description: string; dependencies?: string[] });
    ctx.status = 201;
    ctx.body = { id };
  });

  router.get("/runs/:id", async (ctx) => {
    const run = await store.getRun(ctx.params.id);
    ctx.status = run ? 200 : 404;
    ctx.body = run ?? { error: "run not found" };
  });

  router.get("/runs/:id/events", async (ctx) => {
    ctx.body = await store.getEvents?.(ctx.params.id) ?? [];
  });

  router.post("/runs/:id/cancel", async (ctx) => {
    await store.cancelRun(ctx.params.id);
    ctx.body = { status: "cancelled" };
  });

  router.post("/nodes/:id/retry", async (ctx) => {
    await store.retryNode(ctx.params.id);
    ctx.body = { status: "retrying" };
  });

  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use((ctx) => {
    ctx.status = 404;
    ctx.body = { error: "not found" };
  });
  return app;
}

export function createApiServer(store: ApiStore): Server {
  return createServer(createApiApp(store).callback());
}
