import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignedUrlConfig {
  readonly secret: string;
  readonly ttlSeconds: number;
  readonly baseUrl: string;
}

export interface SignedUrlPayload {
  readonly runId: string;
  readonly itemId: string;
  readonly expiresAt: number;
}

export function createSignedUrl(config: SignedUrlConfig, payload: SignedUrlPayload): string {
  const expiresAt = payload.expiresAt;
  const message = `${payload.runId}:${payload.itemId}:${expiresAt}`;
  const signature = sign(config.secret, message);
  const url = new URL(`/factory/runs/${payload.runId}/evidence/${payload.itemId}/content`, config.baseUrl);
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signature);
  return url.toString();
}

export function verifySignedUrl(config: SignedUrlConfig, input: {
  runId: string;
  itemId: string;
  expires: string;
  signature: string;
}): boolean {
  const expiresAt = Number(input.expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const message = `${input.runId}:${input.itemId}:${expiresAt}`;
  const expected = sign(config.secret, message);
  const provided = Buffer.from(input.signature);
  const actual = Buffer.from(expected);
  if (provided.length !== actual.length) return false;
  return timingSafeEqual(provided, actual);
}

function sign(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}
