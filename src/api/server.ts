import { createServer, type Server } from "node:http";
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import { createAuthMiddleware } from "./auth.js";
import type { ExecutionsService, ExecutionCommand } from "./executions-service.js";
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

export interface ApiAppOptions {
  executions: ExecutionsService;
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
      const notFound = error instanceof Error && /not found/i.test(error.message);
      ctx.status = notFound ? 404 : 400;
      ctx.body = { schemaVersion: "error.v1", error: error instanceof Error ? error.message : String(error) };
    }
  });
  app.use(bodyParser());

  mountGitHubIntegrationRoutes(router, {
    github: options.github,
    webhookSecret: options.githubWebhookSecret,
  });

  router.post("/executions", async (ctx) => {
    const task = await validateTask(ctx.request.body ?? {}, options.github);
    if ("error" in task) {
      ctx.status = task.status;
      ctx.body = { schemaVersion: "error.v1", error: task.error };
      return;
    }
    const execution = await options.executions.createExecution(task.value);
    ctx.status = 201;
    ctx.body = execution;
  });

  router.get("/executions", async (ctx) => {
    ctx.body = await options.executions.listExecutions();
  });

  router.get("/executions/:workflowId", async (ctx) => {
    const execution = await options.executions.getExecution(ctx.params.workflowId);
    ctx.status = execution ? 200 : 404;
    ctx.body = execution ?? { schemaVersion: "error.v1", error: "execution not found" };
  });

  router.post("/executions/:workflowId/commands", async (ctx) => {
    const command = parseCommand(ctx.request.body);
    await options.executions.command(ctx.params.workflowId, command);
    ctx.status = 202;
    ctx.body = { schemaVersion: "execution-command.v1", status: "signaled", command: command.type };
  });

  router.get("/executions/:workflowId/objects/:objectId", async (ctx) => {
    const body = await options.executions.getObject(
      ctx.params.workflowId,
      decodeURIComponent(ctx.params.objectId),
    );
    ctx.type = "application/octet-stream";
    ctx.body = body;
  });

  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use((ctx) => {
    ctx.status = 404;
    ctx.body = { schemaVersion: "error.v1", error: "not found" };
  });
  return app;
}

export function createApiServer(options: ApiAppOptions): Server {
  return createServer(createApiApp(options).callback());
}

async function validateTask(
  body: unknown,
  github?: GitHubAppService,
): Promise<
  | { value: { repository: string; title: string; description: string } }
  | { status: number; error: string }
> {
  try {
    const normalized = normalizeTaskIntake(body as TaskIntakeInput);
    if (github) {
      const status = await github.getStatus();
      if (!status.connected) return { status: 409, error: "GitHub App is not connected" };
      const fullName = repositoryFullName(normalized.repository);
      if (!await github.validateRepositoryAccessible(fullName)) {
        return { status: 422, error: `repository is not accessible via the connected GitHub App: ${fullName}` };
      }
    }
    return { value: normalized };
  } catch (error) {
    return {
      status: 422,
      error: repositoryValidationError(error) ?? (error instanceof Error ? error.message : String(error)),
    };
  }
}

function parseCommand(body: unknown): ExecutionCommand {
  if (!body || typeof body !== "object" || !("type" in body)) throw new Error("command type is required");
  const command = body as ExecutionCommand;
  if (command.type === "cancel" || command.type === "rollback") return command;
  if (command.type === "rerun_node" && typeof command.node === "string") return command;
  if (command.type === "answer_clarification" && command.answer) return command;
  throw new Error("unsupported execution command");
}
