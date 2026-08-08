import type { Middleware } from "koa";

export interface ApiAuthConfig {
  readonly token?: string;
  readonly requireAuthForReads?: boolean;
  readonly publicPaths?: readonly string[];
}

export function createAuthMiddleware(config: ApiAuthConfig): Middleware {
  return async (ctx, next) => {
    if (config.publicPaths?.includes(ctx.path)) {
      await next();
      return;
    }
    if (!config.token) {
      await next();
      return;
    }

    const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(ctx.method.toUpperCase());
    if (!isWrite && !config.requireAuthForReads) {
      await next();
      return;
    }

    const header = ctx.get("authorization");
    const expected = `Bearer ${config.token}`;
    if (header !== expected) {
      ctx.status = 401;
      ctx.body = { schemaVersion: "error.v1", error: "unauthorized" };
      return;
    }

    await next();
  };
}
