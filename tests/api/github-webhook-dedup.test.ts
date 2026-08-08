import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGithubWebhookServer } from "../../src/api/github-webhook.js";

describe("GitHub webhook deduplication", () => {
  it("reconciles a delivery ID only once", async () => {
    const body = JSON.stringify({ action: "edited" });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    let calls = 0;
    const server = createGithubWebhookServer("secret", { reconcile: async () => { calls++; } });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const request = () => fetch(`http://127.0.0.1:${address.port}/webhooks/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
        "x-github-delivery": "same-delivery",
        "x-github-event": "installation",
      },
      body,
    });
    await request();
    await request();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
