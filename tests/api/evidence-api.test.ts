import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { Check } from "typebox/value";
import { createApiApp } from "../../src/api/server.js";
import { createEvidenceService } from "../../src/api/evidence-service.js";
import { createOperationsService } from "../../src/api/operations-service.js";
import type { EvidenceReadModel } from "../../src/db/evidence-read-model.js";
import {
  EvidenceItemViewSchema,
  FactoryRunSummarySchema,
  OperationResponseSchema,
  RunGraphSchema,
} from "../../src/api/evidence-schemas.js";
import { verifySignedUrl } from "../../src/api/signed-urls.js";
import { redactPayload } from "../../src/api/redaction.js";
import { paginate } from "../../src/api/pagination.js";

const signedUrls = {
  secret: "test-secret",
  ttlSeconds: 3600,
  baseUrl: "http://127.0.0.1:8787",
};

function createFixtureReadModel(): EvidenceReadModel {
  return {
    async listRuns() {
      return [{
        runId: "run-1",
        workflowId: "factory-run-1",
        taskId: "task-1",
        status: "rolled_back",
        currentNode: "release_controller",
        failureReason: "observation_failed",
        updatedAt: "2026-08-06T12:00:00.000Z",
      }];
    },
    async getRun(runId) {
      if (runId !== "run-1") return null;
      return {
        runId: "run-1",
        workflowId: "factory-run-1",
        taskId: "task-1",
        status: "rolled_back",
        currentNode: "release_controller",
        failureReason: "observation_failed",
        updatedAt: "2026-08-06T12:00:00.000Z",
      };
    },
    async listAttempts() {
      return [{
        runId: "run-1",
        attemptId: "attempt-release-1",
        node: "release_controller",
        status: "failed",
        startedAt: "2026-08-06T11:55:00.000Z",
        completedAt: "2026-08-06T12:00:00.000Z",
        failureCode: "rollback",
      }];
    },
    async listEvidenceItems() {
      return [{
        id: "ev-1",
        kind: "deployment",
        schemaVersion: "evidence.v1",
        mediaType: "application/json",
        sha256: "a".repeat(64),
        uri: "file:///tmp/ev-1.json",
        producerType: "deploy",
        producerId: "release",
        producerVersion: "1",
        subject: { deploymentId: "dep-1" },
        redaction: "secrets",
        createdAt: "2026-08-06T12:00:00.000Z",
      }];
    },
    async getEvidenceManifest() {
      return {
        hash: "b".repeat(64),
        manifest: {
          schemaVersion: "evidence-manifest.v1",
          runId: "run-1",
          evidenceItemIds: ["ev-1"],
          rollbackTarget: "registry/app@sha256:" + "c".repeat(64),
          updatedAt: "2026-08-06T12:00:00.000Z",
        },
      };
    },
    async listGateDecisions() {
      return [{
        gateId: "release_observation",
        decision: "fail",
        policyVersion: "release.v1",
        reasons: { token: "secret-value", code: "error_rate" },
        evidenceRefs: ["ev-1"],
        decidedAt: "2026-08-06T12:00:00.000Z",
      }];
    },
    async listScenarioRuns() {
      return [{
        scenarioId: "SCN-API",
        attemptId: "scn-1",
        status: "passed",
        satisfaction: 0.95,
        startedAt: "2026-08-06T11:50:00.000Z",
        completedAt: "2026-08-06T11:52:00.000Z",
      }];
    },
    async listProbeRuns() {
      return [{
        probeId: "PRB-ADD",
        attemptId: "probe-1",
        status: "succeeded",
        record: { apiKey: "hidden", comparison: { regressionDetected: false } },
        recordedAt: "2026-08-06T11:53:00.000Z",
      }];
    },
    async listDeployments() {
      return [{
        profile: "staging",
        digest: "registry/app@sha256:" + "d".repeat(64),
        status: "rolled_back",
        updatedAt: "2026-08-06T12:00:00.000Z",
      }];
    },
    async listDeploymentObservations() {
      return [{
        profile: "staging",
        observationId: "obs-1",
        status: "unhealthy",
        observedAt: "2026-08-06T12:00:00.000Z",
      }];
    },
  };
}

function createTestApp(apiToken = "secret-token") {
  const signals: Array<{ name: string; args: unknown[] }> = [];
  const evidenceService = createEvidenceService({
    readModel: createFixtureReadModel(),
    config: { retentionDays: 90, signedUrls },
  });
  const operationsService = createOperationsService({
    workflowClient: {
      workflow: {
        async start() { return {}; },
        getHandle() {
          return {
            async signal(name: string, ...args: unknown[]) {
              signals.push({ name, args });
            },
          };
        },
      },
    },
  });
  const app = createApiApp({
    store: {
      createTask: async () => "run-1",
      getRun: async () => null,
      cancelRun: async () => {},
    },
    evidenceService,
    operationsService,
    signedUrls,
    apiToken,
  });
  return { app, signals };
}

describe("factory evidence API", () => {
  it("returns stable run graph explaining rollback from durable evidence", async () => {
    const { app } = createTestApp();
    const server = createServer(app.callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/factory/runs/run-1/graph`);
    const graph = await response.json();
    expect(response.status).toBe(200);
    expect(Check(RunGraphSchema, graph)).toBe(true);
    expect(graph.outcome.rolledBack).toBe(true);
    expect(graph.outcome.explanation).toContain("rolled back");

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("paginates evidence items and exposes signed object URLs", async () => {
    const { app } = createTestApp();
    const server = createServer(app.callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/factory/runs/run-1/evidence?limit=1`);
    const page = await response.json();
    expect(page.schemaVersion).toBe("page.v1");
    expect(page.items).toHaveLength(1);
    expect(Check(EvidenceItemViewSchema, page.items[0])).toBe(true);
    const signedUrl = new URL(page.items[0].signedUrl);
    expect(verifySignedUrl(signedUrls, {
      runId: "run-1",
      itemId: "ev-1",
      expires: signedUrl.searchParams.get("expires") ?? "",
      signature: signedUrl.searchParams.get("signature") ?? "",
    })).toBe(true);

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("redacts secrets from gate and probe payloads", async () => {
    const redacted = redactPayload({ token: "abc", code: "error_rate" }, "secrets");
    expect(redacted).toEqual({ token: "[REDACTED]", code: "error_rate" });

    const { app } = createTestApp();
    const server = createServer(app.callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;

    const gates = await (await fetch(`${base}/factory/runs/run-1/gates`)).json();
    expect(gates.items[0].reasons).toEqual({ token: "[REDACTED]", code: "error_rate" });

    const probes = await (await fetch(`${base}/factory/runs/run-1/probes`)).json();
    expect(probes.items[0].summary).toEqual({ apiKey: "[REDACTED]", comparison: { regressionDetected: false } });

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("requires authorization for write operations", async () => {
    const { app } = createTestApp("secret-token");
    const server = createServer(app.callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;

    const unauthorized = await fetch(`${base}/factory/runs/run-1/cancel`, { method: "POST" });
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${base}/factory/runs/run-1/cancel`, {
      method: "POST",
      headers: { authorization: "Bearer secret-token" },
    });
    const body = await authorized.json();
    expect(authorized.status).toBe(202);
    expect(Check(OperationResponseSchema, body)).toBe(true);

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("signals Temporal for cancel, rerun, and rollback without mutating projection state", async () => {
    const { app, signals } = createTestApp("secret-token");
    const server = createServer(app.callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: "Bearer secret-token", "content-type": "application/json" };

    await fetch(`${base}/factory/runs/run-1/cancel`, { method: "POST", headers });
    await fetch(`${base}/factory/runs/run-1/rerun`, { method: "POST", headers, body: JSON.stringify({ node: "repair" }) });
    await fetch(`${base}/factory/runs/run-1/rollback`, { method: "POST", headers });

    expect(signals.map((signal) => signal.name)).toEqual(["cancelFactory", "rerunNode", "rollbackRelease"]);
    expect(signals[1].args).toEqual(["repair"]);

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("returns stable run summaries", async () => {
    const { app } = createTestApp();
    const server = createServer(app.callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;

    const run = await (await fetch(`${base}/factory/runs/run-1`)).json();
    expect(Check(FactoryRunSummarySchema, run)).toBe(true);

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});

describe("pagination", () => {
  it("encodes and decodes stable cursors", () => {
    const page = paginate([1, 2, 3, 4], { limit: 2 });
    expect(page.items).toEqual([1, 2]);
    expect(page.hasMore).toBe(true);
    const next = paginate([1, 2, 3, 4], { limit: 2, cursor: page.nextCursor });
    expect(next.items).toEqual([3, 4]);
    expect(next.hasMore).toBe(false);
  });
});
