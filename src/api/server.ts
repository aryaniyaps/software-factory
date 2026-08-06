import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import type { FeedbackApiStore } from "./feedback-api.js";
import { incidentInputFromBody, webhookInputFromBody } from "./feedback-api.js";

export interface ApiStore {
  createTask(input: { repository: string; title: string; description: string }): Promise<string>;
  getRun(id: string): Promise<unknown>;
  getEvents?(id: string): Promise<unknown[]>;
  cancelRun(id: string): Promise<void>;
  feedback?: FeedbackApiStore;
}

type TaskInput = Partial<{ repository: string; title: string; description: string }>;

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
    const id = await store.createTask(input as { repository: string; title: string; description: string });
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

  router.post("/feedback", async (ctx) => {
    if (!store.feedback) {
      ctx.status = 501;
      ctx.body = { error: "feedback ingest not configured" };
      return;
    }
    const deliveryId = (ctx.request.headers["x-delivery-id"] as string | undefined) ?? randomUUID();
    const body = (ctx.request.body ?? {}) as Partial<{ externalId: string; summary: string; body: string; runId: string; incidentId: string; artifactDigest: string }>;
    if (!body.summary || !body.body || !body.runId) {
      ctx.status = 422;
      ctx.body = { error: "summary, body, and runId are required" };
      return;
    }
    const input = webhookInputFromBody(body as { summary: string; body: string; runId: string; externalId?: string; incidentId?: string; artifactDigest?: string }, deliveryId);
    const result = await store.feedback.ingestFeedback(input);
    ctx.status = result.inserted ? 201 : 200;
    ctx.body = result;
  });

  router.post("/incidents", async (ctx) => {
    if (!store.feedback) {
      ctx.status = 501;
      ctx.body = { error: "feedback ingest not configured" };
      return;
    }
    const deliveryId = (ctx.request.headers["x-delivery-id"] as string | undefined) ?? randomUUID();
    const body = (ctx.request.body ?? {}) as Partial<{ incidentId: string; summary: string; body: string; runId: string; artifactDigest: string; outcome: "rollback" | "resolved" | "open"; deliveryId: string }>;
    if (!body.incidentId || !body.summary || !body.body || !body.runId) {
      ctx.status = 422;
      ctx.body = { error: "incidentId, summary, body, and runId are required" };
      return;
    }
    const input = incidentInputFromBody(body as { incidentId: string; summary: string; body: string; runId: string; artifactDigest?: string; outcome?: "rollback" | "resolved" | "open"; deliveryId?: string }, deliveryId);
    const result = await store.feedback.ingestFeedback(input);
    ctx.status = result.inserted ? 201 : 200;
    ctx.body = result;
  });

  router.get("/feedback/:id/trace", async (ctx) => {
    if (!store.feedback) {
      ctx.status = 501;
      ctx.body = { error: "feedback ingest not configured" };
      return;
    }
    const trace = await store.feedback.getFeedbackTrace(ctx.params.id);
    ctx.status = trace ? 200 : 404;
    ctx.body = trace ?? { error: "feedback not found" };
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
