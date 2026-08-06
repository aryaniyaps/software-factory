import { createHash } from "node:crypto";
import type { FaultPlan, FaultScript } from "./faults.js";
import { applyFaultToCall, buildFaultPlan } from "./faults.js";

export interface TwinConfig {
  readonly id: string;
  readonly version: string;
  readonly seed: string;
  readonly faults?: readonly FaultScript[];
}

export interface TwinContext {
  readonly seed: string;
  readonly version: string;
  readonly clock: SimulationClock;
  readonly random: DeterministicRandom;
  readonly faultPlan: FaultPlan;
}

export interface TwinStateSnapshot {
  readonly clockMs: number;
  readonly rngState: number;
  readonly callCount: number;
  readonly data: unknown;
}

export interface RecordedInteraction {
  readonly index: number;
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  readonly request: unknown;
  readonly response: unknown;
  readonly faults?: readonly string[];
}

export interface TwinFixture {
  readonly twinId: string;
  readonly version: string;
  readonly seed: string;
  readonly clockMs: number;
  readonly rngState: number;
  readonly interactions: readonly RecordedInteraction[];
}

export interface HttpTwinRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface HttpTwinResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly latencyMs?: number;
  readonly faultIds?: readonly string[];
}

export interface WebhookDispatchRequest {
  readonly event: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly payload: unknown;
}

export interface WebhookDelivery {
  readonly event: string;
  readonly status: number;
  readonly deliveredAt: string;
  readonly payload: unknown;
}

export interface StoragePutResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface DependencyTwin<TState = unknown> {
  readonly id: string;
  readonly version: string;
  snapshot(): TwinStateSnapshot;
  reset(snapshot?: TwinStateSnapshot): void;
  exportFixture(): TwinFixture;
}

const SECRET_KEY_PATTERN = /(secret|token|password|authorization|api[_-]?key|credential|cookie|bearer)/i;
const PII_KEY_PATTERN = /(email|phone|ssn|address|author)/i;

function hashSeed(seed: string): number {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32LE(0);
}

export class DeterministicRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === "number" ? seed : hashSeed(seed);
  }

  next(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    const span = max - min + 1;
    return min + Math.floor(this.next() * span);
  }

  snapshot(): number {
    return this.state;
  }

  restore(state: number): void {
    this.state = state;
  }
}

export class SimulationClock {
  private nowMs: number;

  constructor(startMs = 1_700_000_000_000) {
    this.nowMs = startMs;
  }

  now(): number {
    return this.nowMs;
  }

  nowISO(): string {
    return new Date(this.nowMs).toISOString();
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  snapshot(): number {
    return this.nowMs;
  }

  restore(ms: number): void {
    this.nowMs = ms;
  }
}

export function createTwinContext(config: Pick<TwinConfig, "seed" | "version"> & { faults?: readonly FaultScript[] }): TwinContext {
  const random = new DeterministicRandom(config.seed);
  const clock = new SimulationClock(hashSeed(`${config.seed}:${config.version}`));
  return {
    seed: config.seed,
    version: config.version,
    clock,
    random,
    faultPlan: buildFaultPlan({
      seed: config.seed,
      version: config.version,
      scripts: config.faults ?? [],
    }),
  };
}

function redactValue(key: string, value: unknown): unknown {
  if (typeof value === "string" && (SECRET_KEY_PATTERN.test(key) || PII_KEY_PATTERN.test(key))) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) return value.map((entry, index) => redactValue(`${key}.${index}`, entry));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactValue(childKey, childValue),
      ]),
    );
  }
  return value;
}

export function redactFixture<T extends TwinFixture>(fixture: T): T {
  return {
    ...fixture,
    interactions: fixture.interactions.map((interaction) => ({
      ...interaction,
      request: redactValue("request", interaction.request),
      response: redactValue("response", interaction.response),
    })),
  } as T;
}

export function stableSerializeFixture(fixture: TwinFixture): string {
  return JSON.stringify(sortKeys(fixture));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

abstract class BaseTwin<TState> implements DependencyTwin<TState> {
  protected readonly context: TwinContext;
  protected callCount = 0;
  protected interactions: RecordedInteraction[] = [];
  protected replayMode = false;
  protected abstract state: TState;

  constructor(readonly config: TwinConfig) {
    this.id = config.id;
    this.version = config.version;
    this.context = createTwinContext(config);
  }

  readonly id: string;
  readonly version: string;

  snapshot(): TwinStateSnapshot {
    return {
      clockMs: this.context.clock.snapshot(),
      rngState: this.context.random.snapshot(),
      callCount: this.callCount,
      data: structuredClone(this.state),
    };
  }

  reset(snapshot?: TwinStateSnapshot): void {
    if (!snapshot) {
      this.callCount = 0;
      this.interactions = [];
      this.replayMode = false;
      this.context.clock.restore(hashSeed(`${this.config.seed}:${this.config.version}`));
      this.context.random.restore(hashSeed(this.config.seed));
      this.state = this.initialState();
      return;
    }
    this.context.clock.restore(snapshot.clockMs);
    this.context.random.restore(snapshot.rngState);
    this.callCount = snapshot.callCount;
    this.state = structuredClone(snapshot.data as TState);
    this.interactions = this.interactions.slice(0, snapshot.callCount);
  }

  exportFixture(): TwinFixture {
    return {
      twinId: this.id,
      version: this.version,
      seed: this.config.seed,
      clockMs: this.context.clock.snapshot(),
      rngState: this.context.random.snapshot(),
      interactions: [...this.interactions],
    };
  }

  importFixture(fixture: TwinFixture): void {
    this.context.clock.restore(fixture.clockMs);
    this.context.random.restore(fixture.rngState);
    this.interactions = [...fixture.interactions];
    this.callCount = 0;
    this.replayMode = true;
    this.state = this.rehydrateFromFixture(fixture);
  }

  protected recordInteraction(
    method: string,
    path: string,
    request: unknown,
    response: unknown,
    faultIds: readonly string[] = [],
  ): void {
    const interaction: RecordedInteraction = {
      index: this.callCount,
      timestamp: this.context.clock.nowISO(),
      method,
      path,
      request,
      response,
      faults: faultIds.length > 0 ? faultIds : undefined,
    };
    this.interactions.push(interaction);
    this.callCount += 1;
  }

  protected abstract initialState(): TState;
  protected abstract rehydrateFromFixture(fixture: TwinFixture): TState;
}

function deterministicResponseBody(config: TwinConfig, request: HttpTwinRequest): unknown {
  const digest = createHash("sha256")
    .update(stableSerializeFixture({
      twinId: config.id,
      version: config.version,
      seed: config.seed,
      clockMs: 0,
      rngState: 0,
      interactions: [{
        index: 0,
        timestamp: "1970-01-01T00:00:00.000Z",
        method: request.method,
        path: request.path,
        request,
        response: {},
      }],
    }))
    .digest("hex")
    .slice(0, 12);
  return {
    ok: request.method !== "DELETE",
    path: request.path,
    token: digest,
    revision: config.version,
  };
}

export class HttpTwin extends BaseTwin<{ lastStatus: number }> {
  protected state: { lastStatus: number } = this.initialState();

  protected initialState(): { lastStatus: number } {
    return { lastStatus: 200 };
  }

  protected rehydrateFromFixture(fixture: TwinFixture): { lastStatus: number } {
    const last = fixture.interactions.at(-1)?.response as HttpTwinResponse | undefined;
    return { lastStatus: last?.status ?? 200 };
  }

  async handle(request: HttpTwinRequest): Promise<HttpTwinResponse> {
    if (this.replayMode) {
      const recorded = this.interactions.find(
        (interaction) => interaction.method === request.method && interaction.path === request.path,
      );
      if (recorded) {
        this.callCount += 1;
        return recorded.response as HttpTwinResponse;
      }
    }

    const callIndex = this.callCount + 1;
    const fault = applyFaultToCall(this.context.faultPlan, callIndex, {
      method: request.method,
      path: request.path,
    });
    if (fault.latencyMs) this.context.clock.advance(fault.latencyMs);

    let response: HttpTwinResponse;
    if (fault.status) {
      response = {
        status: fault.status,
        body: { error: fault.message ?? "fault injected" },
        latencyMs: fault.latencyMs,
        faultIds: fault.faultIds,
      };
    } else if (fault.rateLimited) {
      response = {
        status: 429,
        body: { error: "rate limit exceeded" },
        latencyMs: fault.latencyMs,
        faultIds: fault.faultIds,
      };
    } else {
      response = {
        status: request.method === "DELETE" ? 204 : 200,
        body: deterministicResponseBody(this.config, request),
        latencyMs: fault.latencyMs,
        faultIds: fault.faultIds,
      };
    }

    this.state = { lastStatus: response.status };
    this.recordInteraction(request.method, request.path, request, response, fault.faultIds);
    return response;
  }
}

export class StorageTwin extends BaseTwin<{ objects: Record<string, unknown> }> {
  protected state: { objects: Record<string, unknown> } = this.initialState();

  protected initialState(): { objects: Record<string, unknown> } {
    return { objects: {} };
  }

  protected rehydrateFromFixture(fixture: TwinFixture): { objects: Record<string, unknown> } {
    const objects: Record<string, unknown> = {};
    for (const interaction of fixture.interactions) {
      if (interaction.method !== "PUT") continue;
      const response = interaction.response as StoragePutResult;
      if (!response.ok) continue;
      const request = interaction.request as { key: string; value: unknown };
      objects[request.key] = request.value;
    }
    return { objects };
  }

  listKeys(): string[] {
    return Object.keys(this.state.objects).sort();
  }

  async get(key: string): Promise<unknown> {
    return this.state.objects[key];
  }

  async put(key: string, value: unknown): Promise<StoragePutResult> {
    const callIndex = this.callCount + 1;
    const fault = applyFaultToCall(this.context.faultPlan, callIndex, { method: "PUT", path: key });
    if (fault.partialFailure) {
      const result: StoragePutResult = { ok: false, error: "partial failure simulated" };
      this.recordInteraction("PUT", key, { key, value }, result, fault.faultIds);
      return result;
    }
    if (fault.status) {
      const result: StoragePutResult = { ok: false, error: fault.message ?? "storage fault" };
      this.recordInteraction("PUT", key, { key, value }, result, fault.faultIds);
      return result;
    }

    this.state = { objects: { ...this.state.objects, [key]: value } };
    const result: StoragePutResult = { ok: true };
    this.recordInteraction("PUT", key, { key, value }, result, fault.faultIds);
    return result;
  }
}

export class WebhookTwin extends BaseTwin<{ deliveries: WebhookDelivery[] }> {
  protected state: { deliveries: WebhookDelivery[] } = this.initialState();

  protected initialState(): { deliveries: WebhookDelivery[] } {
    return { deliveries: [] };
  }

  protected rehydrateFromFixture(fixture: TwinFixture): { deliveries: WebhookDelivery[] } {
    return {
      deliveries: fixture.interactions.map((interaction) => interaction.response as WebhookDelivery),
    };
  }

  getLastDelivery(): WebhookDelivery | undefined {
    return this.state.deliveries.at(-1);
  }

  async dispatch(request: WebhookDispatchRequest): Promise<WebhookDelivery> {
    if (this.replayMode) {
      const recorded = this.interactions.find(
        (interaction) => interaction.method === "POST" && interaction.path === `/webhooks/${request.event}`,
      );
      if (recorded) {
        const delivery = recorded.response as WebhookDelivery;
        this.state = { deliveries: [...this.state.deliveries, delivery] };
        this.callCount += 1;
        return delivery;
      }
    }

    const delivery: WebhookDelivery = {
      event: request.event,
      status: 202,
      deliveredAt: this.context.clock.nowISO(),
      payload: request.payload,
    };
    this.state = { deliveries: [...this.state.deliveries, delivery] };
    this.recordInteraction("POST", `/webhooks/${request.event}`, request, delivery);
    return delivery;
  }
}
