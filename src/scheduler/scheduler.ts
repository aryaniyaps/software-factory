export type ScheduledStatus = "pending" | "leased" | "succeeded" | "failed" | "cancelled";

export interface ScheduledNode {
  id: string;
  status: ScheduledStatus;
  dependencies: string[];
  leaseExpiresAt?: number;
}

export interface SchedulerEvent {
  nodeId: string;
  type: "leased" | "succeeded" | "failed" | "reclaimed";
}

export interface SchedulerStore {
  reclaimExpired(now: number): void;
  leaseReady(limit: number, now: number): ScheduledNode[];
  complete(id: string): void;
  fail(id: string): void;
}

export class InMemorySchedulerStore implements SchedulerStore {
  public readonly events: SchedulerEvent[] = [];
  private readonly nodes: ScheduledNode[];

  constructor(nodes: ScheduledNode[]) {
    this.nodes = nodes.map((node) => ({ ...node, dependencies: [...node.dependencies] }));
  }

  reclaimExpired(now: number): void {
    for (const node of this.nodes) {
      if (node.status === "leased" && node.leaseExpiresAt !== undefined && node.leaseExpiresAt <= now) {
        node.status = "pending";
        node.leaseExpiresAt = undefined;
        this.events.push({ nodeId: node.id, type: "reclaimed" });
      }
    }
  }

  leaseReady(limit: number, now: number): ScheduledNode[] {
    const ready = this.nodes
      .filter((node) => node.status === "pending")
      .filter((node) => node.dependencies.every((dependency) => this.status(dependency) === "succeeded"))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, limit);
    for (const node of ready) {
      node.status = "leased";
      node.leaseExpiresAt = now + 60_000;
      this.events.push({ nodeId: node.id, type: "leased" });
    }
    return ready;
  }

  complete(id: string): void {
    const node = this.find(id);
    node.status = "succeeded";
    node.leaseExpiresAt = undefined;
    this.events.push({ nodeId: id, type: "succeeded" });
  }

  fail(id: string): void {
    const node = this.find(id);
    node.status = "failed";
    node.leaseExpiresAt = undefined;
    this.events.push({ nodeId: id, type: "failed" });
  }

  status(id: string): ScheduledStatus {
    return this.find(id).status;
  }

  private find(id: string): ScheduledNode {
    const node = this.nodes.find((item) => item.id === id);
    if (!node) throw new Error(`unknown node: ${id}`);
    return node;
  }
}

export class FactoryScheduler {
  constructor(
    private readonly store: SchedulerStore,
    private readonly execute: (node: ScheduledNode) => Promise<void>,
    private readonly concurrency: number,
  ) {}

  async tick(): Promise<void> {
    const now = Date.now();
    this.store.reclaimExpired(now);
    const nodes = this.store.leaseReady(this.concurrency, now);
    await Promise.all(nodes.map(async (node) => {
      try {
        await this.execute(node);
        if (node.status === "leased") this.store.complete(node.id);
      } catch {
        this.store.fail(node.id);
      }
    }));
  }
}
