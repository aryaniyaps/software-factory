import { describe, expect, it } from "vitest";
import { GraphRepository } from "../../src/db/graph-repository.js";

class FakePool {
  public queries: string[] = [];
  async query(text: string): Promise<{ rows: unknown[] }> {
    this.queries.push(text);
    return { rows: [] };
  }
}

describe("GraphRepository", () => {
  it("creates runs and records events through the database client", async () => {
    const pool = new FakePool();
    const repository = new GraphRepository(pool as never);

    await repository.createRun({ id: "run-1", title: "Add health endpoint" });
    await repository.appendEvent({ runId: "run-1", type: "run_created", payload: { ok: true } });

    expect(pool.queries).toHaveLength(2);
    expect(pool.queries[0]).toContain("INSERT INTO runs");
    expect(pool.queries[1]).toContain("INSERT INTO events");
  });
});
