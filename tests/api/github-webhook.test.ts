import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGithubWebhookServer } from "../../src/api/github-webhook.js";

describe("GitHub webhook server", () => {
  it("accepts a signed delivery and delegates reconciliation", async () => {
    const body = JSON.stringify({ action: "edited" });
    const secret = "secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    let delivery = "";
    let receivedEvent = "";
    const server = createGithubWebhookServer(secret, {
      reconcile: async (id, event) => {
        delivery = id;
        receivedEvent = event;
      },
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
        "x-github-delivery": "delivery-1",
        "x-github-event": "installation",
      },
      body,
    });
    expect(response.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivery).toBe("delivery-1");
    expect(receivedEvent).toBe("installation");
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
