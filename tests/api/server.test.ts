import { describe, expect, it } from "vitest";
import { createApiServer, type ApiStore } from "../../src/api/server.js";

class FakeApiStore implements ApiStore {
  runs = new Map<string, { id: string; title: string }>();
  async createTask(input: { repository: string; title: string; description: string }): Promise<string> {
    const id = "run-1";
    this.runs.set(id, { id, title: input.title });
    return id;
  }
  async getRun(id: string): Promise<unknown> { return this.runs.get(id) ?? null; }
  async cancelRun(id: string): Promise<void> { this.runs.delete(id); }
  async retryNode(_id: string): Promise<void> {}
}

describe("factory API", () => {
  it("creates and reads a task", async () => {
    const server = createApiServer(new FakeApiStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repository: "/repo", title: "Health", description: "Add health" }) });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: string };
    expect(await (await fetch(`${base}/runs/${created.id}`)).json()).toEqual({ id: "run-1", title: "Health" });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
