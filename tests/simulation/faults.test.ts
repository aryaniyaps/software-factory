import { describe, expect, it } from "vitest";
import { HttpTwin } from "../../src/simulation/twin.js";
import {
  FaultScript,
  applyFaultScripts,
  buildFaultPlan,
  replayRareFailure,
} from "../../src/simulation/faults.js";

describe("fault scripts", () => {
  const baseScripts: FaultScript[] = [
    { id: "slow-read", kind: "latency", latencyMs: 25, triggerOnCall: 2 },
    { id: "rate-limit", kind: "rate_limit", maxRequests: 2, windowMs: 1_000 },
    { id: "server-error", kind: "error", status: 503, message: "upstream unavailable", triggerOnCall: 3 },
    { id: "reorder", kind: "reorder", priority: 1 },
    { id: "partial-write", kind: "partial_failure", successRatio: 0.5, triggerOnCall: 4 },
  ];

  it("applies latency, error, and rate-limit faults deterministically", async () => {
    const twin = new HttpTwin({
      id: "http-api",
      version: "1.0.0",
      seed: "fault-seed",
      faults: baseScripts,
    });

    const first = await twin.handle({ method: "GET", path: "/items/1" });
    const second = await twin.handle({ method: "GET", path: "/items/2" });
    const third = await twin.handle({ method: "GET", path: "/items/3" });
    const fourth = await twin.handle({ method: "GET", path: "/items/4" });

    expect(first.status).toBe(200);
    expect(second.latencyMs).toBe(25);
    expect(third.status).toBe(503);
    expect(third.body).toMatchObject({ error: "upstream unavailable" });
    expect(fourth.status).toBe(429);
  });

  it("builds the same fault plan for the same seed and twin version", () => {
    const left = buildFaultPlan({ seed: "rare-failure", version: "1.0.0", scripts: baseScripts });
    const right = buildFaultPlan({ seed: "rare-failure", version: "1.0.0", scripts: baseScripts });
    expect(left).toEqual(right);
  });

  it("replays a recorded rare failure without external services", async () => {
    const twin = new HttpTwin({
      id: "http-api",
      version: "1.0.0",
      seed: "rare-failure",
      faults: [{ id: "flaky", kind: "error", status: 500, message: "transient", triggerOnCall: 5 }],
    });

    for (let index = 0; index < 4; index += 1) {
      await twin.handle({ method: "GET", path: `/warmup/${index}` });
    }
    const failure = await twin.handle({ method: "GET", path: "/critical" });
    expect(failure.status).toBe(500);

    const replay = replayRareFailure(twin.exportFixture());
    const replayed = await replay.handle({ method: "GET", path: "/critical" });
    expect(replayed).toEqual(failure);
  });

  it("reorders batched calls deterministically", () => {
    const scripts: FaultScript[] = [{ id: "reorder", kind: "reorder", priority: 1 }];
    const plan = buildFaultPlan({ seed: "reorder-seed", version: "1.0.0", scripts });
    const calls = [
      { callIndex: 0, path: "/a" },
      { callIndex: 1, path: "/b" },
      { callIndex: 2, path: "/c" },
    ];
    const ordered = applyFaultScripts(calls, plan);
    expect(applyFaultScripts(calls, plan)).toEqual(ordered);
    expect(ordered.map((entry) => entry.path)).not.toEqual(calls.map((entry) => entry.path));
  });

  it("simulates partial failures on storage writes", async () => {
    const { StorageTwin } = await import("../../src/simulation/twin.js");
    const storage = new StorageTwin({
      id: "object-store",
      version: "1.0.0",
      seed: "partial-failure",
      faults: [{ id: "partial", kind: "partial_failure", successRatio: 0.5, triggerOnCall: 2 }],
    });

    const success = await storage.put("a", { value: 1 });
    const failure = await storage.put("b", { value: 2 });

    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    expect(failure.error).toMatch(/partial/i);
    expect(await storage.get("a")).toEqual({ value: 1 });
    expect(await storage.get("b")).toBeUndefined();
  });
});
