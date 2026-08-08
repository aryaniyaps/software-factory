import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";

export interface GithubWebhookHandler {
  reconcile(deliveryId: string, event: string, payload: unknown): Promise<void>;
}

export function verifyGithubSignature(
  secret: string,
  body: string,
  signature: string | undefined,
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createGithubWebhookServer(secret: string, handler: GithubWebhookHandler): Server {
  const deliveries = new Set<string>();
  return createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    if (request.method !== "POST" || request.url !== "/webhooks/github") {
      response.writeHead(404).end();
      return;
    }
    if (!verifyGithubSignature(secret, body, request.headers["x-hub-signature-256"] as string | undefined)) {
      response.writeHead(401).end(JSON.stringify({ error: "invalid signature" }));
      return;
    }
    const deliveryId = request.headers["x-github-delivery"];
    const event = request.headers["x-github-event"];
    if (typeof deliveryId !== "string") {
      response.writeHead(400).end(JSON.stringify({ error: "missing delivery id" }));
      return;
    }
    if (typeof event !== "string") {
      response.writeHead(400).end(JSON.stringify({ error: "missing event type" }));
      return;
    }
    response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ accepted: true }));
    if (deliveries.has(deliveryId)) return;
    deliveries.add(deliveryId);
    await handler.reconcile(deliveryId, event, JSON.parse(body));
  });
}
