import { describe, expect, it, vi } from "vitest";
import { HealthChecker } from "../../src/deploy/health-checker.js";

describe("HealthChecker", () => {
  it("retries a transient failure and then succeeds", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("bad", { status: 503 })).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await expect(new HealthChecker(fetcher).wait("http://service", { attempts: 2, intervalMs: 0 })).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
