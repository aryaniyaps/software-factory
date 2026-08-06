import { describe, expect, it } from "vitest";
import {
  HttpTwin,
  StorageTwin,
  WebhookTwin,
  createTwinContext,
  redactFixture,
  stableSerializeFixture,
  type RecordedInteraction,
} from "../../src/simulation/twin.js";
import { TwinRegistry, createDefaultTwinRegistry } from "../../src/simulation/registry.js";

describe("dependency twins", () => {
  it("produces identical HTTP responses for the same seed and twin version", async () => {
    const left = new HttpTwin({ id: "http-api", version: "1.0.0", seed: "scenario-alpha" });
    const right = new HttpTwin({ id: "http-api", version: "1.0.0", seed: "scenario-alpha" });

    const request = { method: "GET", path: "/health", headers: { authorization: "Bearer secret-token" } };
    const leftResponse = await left.handle(request);
    const rightResponse = await right.handle(request);

    expect(leftResponse).toEqual(rightResponse);
    expect(leftResponse.status).toBe(200);
  });

  it("diverges when the twin version changes", async () => {
    const v1 = new HttpTwin({ id: "http-api", version: "1.0.0", seed: "scenario-alpha" });
    const v2 = new HttpTwin({ id: "http-api", version: "1.1.0", seed: "scenario-alpha" });

    const request = { method: "POST", path: "/orders", body: { sku: "widget" } };
    const first = await v1.handle(request);
    const second = await v2.handle(request);

    expect(first.body).not.toEqual(second.body);
  });

  it("snapshots and resets twin state deterministically", async () => {
    const twin = new StorageTwin({ id: "object-store", version: "1.0.0", seed: "storage-seed" });
    await twin.put("artifacts/build.tar", { digest: "sha256:abc" });
    const snapshot = twin.snapshot();

    await twin.put("artifacts/build.tar", { digest: "sha256:changed" });
    expect(await twin.get("artifacts/build.tar")).toEqual({ digest: "sha256:changed" });

    twin.reset(snapshot);
    expect(await twin.get("artifacts/build.tar")).toEqual({ digest: "sha256:abc" });
  });

  it("records and replays interactions with secret redaction", async () => {
    const twin = new WebhookTwin({ id: "github-webhook", version: "1.0.0", seed: "webhook-seed" });
    await twin.dispatch({
      event: "pull_request.opened",
      headers: { authorization: "Bearer super-secret", "x-github-delivery": "abc" },
      payload: { number: 42, author: "agent@example.com" },
    });

    const fixture = twin.exportFixture();
    const redacted = redactFixture(fixture);
    expect(JSON.stringify(redacted)).not.toContain("super-secret");
    const firstInteraction = redacted.interactions[0] as RecordedInteraction | undefined;
    const request = firstInteraction?.request as { headers?: Record<string, string> } | undefined;
    expect(request?.headers?.authorization).toBe("[REDACTED]");

    const replay = new WebhookTwin({ id: "github-webhook", version: "1.0.0", seed: "webhook-seed" });
    replay.importFixture(fixture);
    const replayed = await replay.dispatch({
      event: "pull_request.opened",
      headers: { authorization: "Bearer super-secret", "x-github-delivery": "abc" },
      payload: { number: 42, author: "agent@example.com" },
    });
    expect(replayed).toEqual(twin.getLastDelivery());
  });

  it("registers versioned twins and resets the bundle from a snapshot", async () => {
    const registry = createDefaultTwinRegistry("bundle-seed");
    const http = registry.get("http-api", "1.0.0") as HttpTwin;
    const storage = registry.get("object-store", "1.0.0") as StorageTwin;
    expect(http).toBeDefined();
    expect(storage).toBeDefined();

    await http.handle({ method: "GET", path: "/status" });
    await storage.put("cache/state", { ready: true });
    const snapshot = registry.snapshot();

    await http.handle({ method: "DELETE", path: "/status" });
    await storage.put("cache/state", { ready: false });

    registry.reset(snapshot);
    expect(storage.listKeys()).toEqual(["cache/state"]);
    expect(await storage.get("cache/state")).toEqual({ ready: true });
  });

  it("serializes fixtures deterministically for replay evidence", () => {
    const context = createTwinContext({ seed: "fixture-seed", version: "1.0.0" });
    const fixture = {
      twinId: "http-api",
      version: "1.0.0",
      seed: "fixture-seed",
      clockMs: context.clock.now(),
      rngState: context.random.snapshot(),
      interactions: [{
        index: 0,
        timestamp: context.clock.nowISO(),
        method: "GET",
        path: "/health",
        request: { headers: { authorization: "Bearer secret" } },
        response: { status: 200, body: { ok: true } },
      }],
    };
    const left = stableSerializeFixture(redactFixture(fixture));
    const right = stableSerializeFixture(redactFixture(fixture));
    expect(left).toBe(right);
  });
});

describe("twin registry", () => {
  it("rejects duplicate twin ids for the same version", () => {
    const registry = new TwinRegistry();
    registry.register(new HttpTwin({ id: "http-api", version: "1.0.0", seed: "a" }));
    expect(() => registry.register(new HttpTwin({ id: "http-api", version: "1.0.0", seed: "b" })))
      .toThrow(/already registered/i);
  });
});
