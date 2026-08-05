import { describe, expect, it } from "vitest";
import { GraphRepository } from "../../src/db/graph-repository.js";

class FakePool {
  queries: Array<{ text: string; values?: unknown[] }> = [];
  async query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
    this.queries.push({ text, values });
    return { rows: [] };
  }
}

describe("GraphRepository node operations", () => {
  it("persists nodes and dependency edges", async () => {
    const db = new FakePool();
    const repository = new GraphRepository(db as never);
    await repository.createNode({ id: "node-1", runId: "run-1", kind: "agent", name: "scout", input: {} });
    await repository.createEdge("node-1", "node-2");
    expect(db.queries.map((query) => query.text)).toEqual([
      expect.stringContaining("INSERT INTO nodes"),
      expect.stringContaining("INSERT INTO edges"),
    ]);
  });

  it("leases ready nodes with a database lock", async () => {
    const db = new FakePool();
    const repository = new GraphRepository(db as never);
    await repository.leaseReady("worker-1", 2, 60_000);
    expect(db.queries[0].text).toContain("SKIP LOCKED");
  });
});
