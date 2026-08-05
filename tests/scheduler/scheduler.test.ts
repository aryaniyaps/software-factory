import { describe, expect, it } from "vitest";
import { InMemorySchedulerStore, FactoryScheduler } from "../../src/scheduler/scheduler.js";

describe("FactoryScheduler", () => {
  it("leases independent ready nodes up to concurrency", async () => {
    const store = new InMemorySchedulerStore([
      { id: "a", status: "pending", dependencies: [] },
      { id: "b", status: "pending", dependencies: [] },
      { id: "c", status: "pending", dependencies: ["a"] },
    ]);
    const scheduler = new FactoryScheduler(store, async (node) => {
      await Promise.resolve(node.id);
      store.complete(node.id);
    }, 2);

    await scheduler.tick();
    expect(store.status("a")).toBe("succeeded");
    expect(store.status("b")).toBe("succeeded");
    expect(store.status("c")).toBe("pending");
    expect(store.events.map((event) => event.type).sort()).toEqual(["leased", "leased", "succeeded", "succeeded"]);
  });

  it("reclaims expired leases", async () => {
    const store = new InMemorySchedulerStore([{ id: "a", status: "leased", dependencies: [], leaseExpiresAt: Date.now() - 1 }]);
    const scheduler = new FactoryScheduler(store, async (node) => store.complete(node.id), 1);
    await scheduler.tick();
    expect(store.status("a")).toBe("succeeded");
  });
});
