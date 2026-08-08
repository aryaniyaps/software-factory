import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../../src/api/server.js";
import { fakeExecutions } from "./fake-executions.js";

const executions = fakeExecutions();

describe("Koa API", () => {
  it("returns a JSON 400 for incomplete task requests", async () => {
    const server = createServer(createApiApp({ executions }).callback());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/executions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "/repo" }),
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("exposes an application callback without starting a server", () => {
    const app = createApiApp({ executions });
    expect(typeof app.callback()).toBe("function");
  });
});
