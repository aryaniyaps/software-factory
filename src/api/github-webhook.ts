import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";

export interface GithubWebhookHandler {
  reconcile(deliveryId: string, event: unknown): Promise<void>;
}

function validSignature(secret: string, body: string, signature: string | undefined): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createGithubWebhookServer(secret: string, handler: GithubWebhookHandler): Server {
  return createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    if (request.method !== "POST" || request.url !== "/webhooks/github") {
      response.writeHead(404).end();
      return;
    }
    if (!validSignature(secret, body, request.headers["x-hub-signature-256"] as string | undefined)) {
      response.writeHead(401).end(JSON.stringify({ error: "invalid signature" }));
      return;
    }
    const deliveryId = request.headers["x-github-delivery"];
    if (typeof deliveryId !== "string") {
      response.writeHead(400).end(JSON.stringify({ error: "missing delivery id" }));
      return;
    }
    response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ accepted: true }));
    await handler.reconcile(deliveryId, JSON.parse(body));
  });
}
