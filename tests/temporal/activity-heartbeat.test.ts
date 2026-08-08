import { describe, expect, it } from "vitest";
import { startActivityHeartbeat } from "../../src/temporal/activities/activity-heartbeat.js";

describe("startActivityHeartbeat", () => {
  it("starts and stops without throwing outside Temporal activity context", async () => {
    const stop = startActivityHeartbeat(10);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(() => stop()).not.toThrow();
  });
});
