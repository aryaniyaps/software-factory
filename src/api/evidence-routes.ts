import Router from "@koa/router";
import type Koa from "koa";
import { FACTORY_NODE_NAMES, type FactoryNodeName } from "../contracts/nodes.js";
import { verifySignedUrl } from "./signed-urls.js";
import { parsePageRequest } from "./pagination.js";
import type { EvidenceService } from "./evidence-service.js";
import type { OperationsService } from "./operations-service.js";
import type { SignedUrlConfig } from "./signed-urls.js";

export interface EvidenceRoutesInput {
  evidenceService: EvidenceService;
  operationsService: OperationsService;
  signedUrls: SignedUrlConfig;
}

export function createEvidenceRouter(input: EvidenceRoutesInput): Router {
  const router = new Router({ prefix: "/factory" });

  router.get("/runs", async (ctx) => {
    ctx.body = await input.evidenceService.listRuns(parsePageRequest(ctx.query as Record<string, unknown>));
  });

  router.get("/runs/:runId", async (ctx) => {
    const run = await input.evidenceService.getRun(ctx.params.runId);
    if (!run) {
      ctx.status = 404;
      ctx.body = { schemaVersion: "error.v1", error: "run not found" };
      return;
    }
    ctx.body = run;
  });

  router.get("/runs/:runId/graph", async (ctx) => {
    const graph = await input.evidenceService.getRunGraph(ctx.params.runId);
    if (!graph) {
      ctx.status = 404;
      ctx.body = { schemaVersion: "error.v1", error: "run not found" };
      return;
    }
    ctx.body = graph;
  });

  router.get("/runs/:runId/attempts", async (ctx) => {
    ctx.body = await input.evidenceService.listAttempts(ctx.params.runId, parsePageRequest(ctx.query as Record<string, unknown>));
  });

  router.get("/runs/:runId/evidence", async (ctx) => {
    ctx.body = await input.evidenceService.listEvidence(ctx.params.runId, parsePageRequest(ctx.query as Record<string, unknown>));
  });

  router.get("/runs/:runId/evidence/manifest", async (ctx) => {
    const manifest = await input.evidenceService.getEvidenceManifest(ctx.params.runId);
    if (!manifest) {
      ctx.status = 404;
      ctx.body = { schemaVersion: "error.v1", error: "manifest not found" };
      return;
    }
    ctx.body = manifest;
  });

  router.get("/runs/:runId/evidence/:itemId", async (ctx) => {
    const item = await input.evidenceService.getEvidenceItem(ctx.params.runId, ctx.params.itemId);
    if (!item) {
      ctx.status = 404;
      ctx.body = { schemaVersion: "error.v1", error: "evidence item not found" };
      return;
    }
    ctx.body = item;
  });

  router.get("/runs/:runId/evidence/:itemId/content", async (ctx) => {
    const expires = String(ctx.query.expires ?? "");
    const signature = String(ctx.query.signature ?? "");
    if (!verifySignedUrl(input.signedUrls, {
      runId: ctx.params.runId,
      itemId: ctx.params.itemId,
      expires,
      signature,
    })) {
      ctx.status = 403;
      ctx.body = { schemaVersion: "error.v1", error: "invalid or expired signed url" };
      return;
    }
    const item = await input.evidenceService.getEvidenceItem(ctx.params.runId, ctx.params.itemId);
    if (!item) {
      ctx.status = 404;
      ctx.body = { schemaVersion: "error.v1", error: "evidence item not found" };
      return;
    }
    ctx.body = {
      schemaVersion: "evidence-content.v1",
      itemId: item.id,
      sha256: item.sha256,
      mediaType: item.mediaType,
      redaction: item.redaction,
      note: "content served from object store projection; inline body omitted for redaction policy",
    };
  });

  router.get("/runs/:runId/gates", async (ctx) => {
    ctx.body = await input.evidenceService.listGates(ctx.params.runId, parsePageRequest(ctx.query as Record<string, unknown>));
  });

  router.get("/runs/:runId/scenarios", async (ctx) => {
    ctx.body = await input.evidenceService.listScenarios(ctx.params.runId, parsePageRequest(ctx.query as Record<string, unknown>));
  });

  router.get("/runs/:runId/probes", async (ctx) => {
    ctx.body = await input.evidenceService.listProbes(ctx.params.runId, parsePageRequest(ctx.query as Record<string, unknown>));
  });

  router.get("/runs/:runId/deployments", async (ctx) => {
    ctx.body = await input.evidenceService.listDeployments(ctx.params.runId);
  });

  router.post("/runs/:runId/cancel", async (ctx) => {
    ctx.body = await input.operationsService.cancelRun(ctx.params.runId);
    ctx.status = 202;
  });

  router.post("/runs/:runId/rerun", async (ctx) => {
    const body = (ctx.request.body ?? {}) as { node?: string };
    if (!body.node || !FACTORY_NODE_NAMES.includes(body.node as FactoryNodeName)) {
      ctx.status = 422;
      ctx.body = { schemaVersion: "error.v1", error: "node is required and must be a factory node name" };
      return;
    }
    ctx.body = await input.operationsService.rerunNode(ctx.params.runId, body.node as FactoryNodeName);
    ctx.status = 202;
  });

  router.post("/runs/:runId/rollback", async (ctx) => {
    ctx.body = await input.operationsService.rollbackRelease(ctx.params.runId);
    ctx.status = 202;
  });

  return router;
}

export function mountEvidenceRoutes(app: Koa, input: EvidenceRoutesInput): void {
  const router = createEvidenceRouter(input);
  app.use(router.routes());
  app.use(router.allowedMethods());
}
