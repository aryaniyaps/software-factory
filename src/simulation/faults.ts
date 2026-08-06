import { createHash } from "node:crypto";
import { HttpTwin, type HttpTwinRequest, type HttpTwinResponse, type TwinFixture } from "./twin.js";

export type FaultKind = "latency" | "error" | "rate_limit" | "reorder" | "partial_failure";

export interface FaultScript {
  readonly id: string;
  readonly kind: FaultKind;
  readonly latencyMs?: number;
  readonly status?: number;
  readonly message?: string;
  readonly maxRequests?: number;
  readonly windowMs?: number;
  readonly priority?: number;
  readonly successRatio?: number;
  readonly triggerOnCall?: number;
}

export interface FaultPlan {
  readonly seed: string;
  readonly version: string;
  readonly scripts: readonly FaultScript[];
  readonly reorderSeed: string;
}

export interface FaultApplication {
  readonly faultIds: readonly string[];
  readonly latencyMs?: number;
  readonly status?: number;
  readonly message?: string;
  readonly rateLimited?: boolean;
  readonly partialFailure?: boolean;
}

export interface ReorderableCall {
  readonly callIndex: number;
  readonly path: string;
}

function hashSeed(seed: string): number {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32LE(0);
}

function mulberry32(state: number): () => number {
  let current = state;
  return () => {
    current += 0x6D2B79F5;
    let t = current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFaultPlan(input: {
  readonly seed: string;
  readonly version: string;
  readonly scripts: readonly FaultScript[];
}): FaultPlan {
  return {
    seed: input.seed,
    version: input.version,
    scripts: [...input.scripts].sort((left, right) => left.id.localeCompare(right.id)),
    reorderSeed: createHash("sha256").update(`${input.seed}:${input.version}:reorder`).digest("hex"),
  };
}

export function applyFaultToCall(
  plan: FaultPlan,
  callIndex: number,
  _request: Pick<HttpTwinRequest, "method" | "path">,
): FaultApplication {
  const faultIds: string[] = [];
  let latencyMs: number | undefined;
  let status: number | undefined;
  let message: string | undefined;
  let rateLimited = false;
  let partialFailure = false;

  const rateScripts = plan.scripts.filter((script) => script.kind === "rate_limit");
  for (const script of rateScripts) {
    const maxRequests = script.maxRequests ?? 1;
    const windowStart = Math.floor((callIndex - 1) / maxRequests);
    const windowCall = callIndex - windowStart * maxRequests;
    if (windowCall > maxRequests) {
      rateLimited = true;
      faultIds.push(script.id);
    }
  }

  for (const script of plan.scripts) {
    if (script.triggerOnCall !== undefined && script.triggerOnCall !== callIndex) continue;
    switch (script.kind) {
      case "latency":
        latencyMs = (latencyMs ?? 0) + (script.latencyMs ?? 0);
        faultIds.push(script.id);
        break;
      case "error":
        status = script.status ?? 500;
        message = script.message ?? "fault injected";
        faultIds.push(script.id);
        break;
      case "partial_failure": {
        const random = mulberry32(hashSeed(`${plan.seed}:${plan.version}:${callIndex}`));
        const succeeds = random() < (script.successRatio ?? 0.5);
        partialFailure = !succeeds;
        if (partialFailure) faultIds.push(script.id);
        break;
      }
      case "rate_limit":
        if (callIndex > (script.maxRequests ?? 1)) {
          rateLimited = true;
          faultIds.push(script.id);
        }
        break;
      default:
        break;
    }
  }

  return {
    faultIds,
    latencyMs,
    status,
    message,
    rateLimited,
    partialFailure,
  };
}

export function applyFaultScripts<T extends ReorderableCall>(
  calls: readonly T[],
  plan: FaultPlan,
): T[] {
  const reorderScript = plan.scripts.find((script) => script.kind === "reorder");
  if (!reorderScript) return [...calls];

  const items = [...calls];
  const random = mulberry32(hashSeed(plan.reorderSeed));
  const firstIndex = Math.floor(random() * items.length);
  let secondIndex = Math.floor(random() * items.length);
  if (items.length > 1) {
    while (secondIndex === firstIndex) {
      secondIndex = Math.floor(random() * items.length);
    }
    const first = items[firstIndex]!;
    items[firstIndex] = items[secondIndex]!;
    items[secondIndex] = first;
  }
  return items;
}

export function replayRareFailure(fixture: TwinFixture): HttpTwin {
  const twin = new HttpTwin({
    id: fixture.twinId,
    version: fixture.version,
    seed: fixture.seed,
  });
  twin.importFixture(fixture);
  return twin;
}

export async function replayHttpInteraction(
  twin: HttpTwin,
  request: HttpTwinRequest,
): Promise<HttpTwinResponse> {
  return twin.handle(request);
}
