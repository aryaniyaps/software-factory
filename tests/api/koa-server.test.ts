import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createApiApp, type ApiStore } from "../../src/api/server.js";

const store: ApiStore = {
  createTask: async () => "run-1",
  getRun: async (id) => id === "run-1" ? { id } : null,
  cancelRun: async () => {},
};

describe("Koa API", () => {
  it("returns a JSON 400 for incomplete task requests", async () => {
    const server = createServer(createApiApp(store).callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "/repo" }),
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("exposes an application callback without starting a server", () => {
    const app = createApiApp(store);
    expect(typeof app.callback()).toBe("function");
  });
});
