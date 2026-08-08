import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import { describe, expect, it } from "vitest";
import { createA2AServer } from "../../src/api/a2a-server.js";
import { fakeExecutions } from "./fake-executions.js";

describe("A2A server", () => {
  it("publishes an authenticated A2A v1 Agent Card", async () => {
    const server = createA2AServer({
      executions: fakeExecutions(),
      publicUrl: "http://127.0.0.1:8788",
      apiToken: "secret",
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");

    const unauthorized = await fetch(`http://127.0.0.1:${address.port}/${AGENT_CARD_PATH}`);
    expect(unauthorized.status).toBe(401);
    const response = await fetch(`http://127.0.0.1:${address.port}/${AGENT_CARD_PATH}`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Software Factory",
      version: "1.0.0",
      capabilities: { streaming: true },
    });

    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  });
});
