import type { DependencyTwin, TwinStateSnapshot } from "./twin.js";
import { HttpTwin, StorageTwin, WebhookTwin } from "./twin.js";

export type TwinSnapshotBundle = Readonly<Record<string, TwinStateSnapshot>>;

export class TwinRegistry {
  private readonly twins = new Map<string, DependencyTwin>();

  register(twin: DependencyTwin): void {
    const key = registryKey(twin.id, twin.version);
    if (this.twins.has(key)) {
      throw new Error(`twin already registered: ${twin.id}@${twin.version}`);
    }
    this.twins.set(key, twin);
  }

  get(id: string, version?: string): DependencyTwin | undefined {
    if (version) return this.twins.get(registryKey(id, version));
    const matches = [...this.twins.entries()].filter(([key]) => key.startsWith(`${id}@`));
    if (matches.length === 0) return undefined;
    matches.sort(([left], [right]) => left.localeCompare(right));
    return matches.at(-1)?.[1];
  }

  list(): DependencyTwin[] {
    return [...this.twins.values()].sort((left, right) => {
      const byId = left.id.localeCompare(right.id);
      return byId !== 0 ? byId : left.version.localeCompare(right.version);
    });
  }

  snapshot(): TwinSnapshotBundle {
    const bundle: Record<string, TwinStateSnapshot> = {};
    for (const twin of this.list()) {
      bundle[registryKey(twin.id, twin.version)] = twin.snapshot();
    }
    return bundle;
  }

  reset(snapshot?: TwinSnapshotBundle): void {
    for (const twin of this.list()) {
      const key = registryKey(twin.id, twin.version);
      twin.reset(snapshot?.[key]);
    }
  }
}

export function createDefaultTwinRegistry(seed: string): TwinRegistry {
  const registry = new TwinRegistry();
  registry.register(new HttpTwin({ id: "http-api", version: "1.0.0", seed }));
  registry.register(new WebhookTwin({ id: "github-webhook", version: "1.0.0", seed }));
  registry.register(new StorageTwin({ id: "object-store", version: "1.0.0", seed }));
  return registry;
}

function registryKey(id: string, version: string): string {
  return `${id}@${version}`;
}
