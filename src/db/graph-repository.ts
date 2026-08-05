import type { Pool } from "pg";

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface RunInput {
  id: string;
  title: string;
}

export interface EventInput {
  runId: string;
  nodeId?: string;
  type: string;
  payload: unknown;
}

export class GraphRepository {
  constructor(private readonly db: Queryable | Pool) {}

  async createRun(input: RunInput): Promise<void> {
    await this.db.query("INSERT INTO runs (id, title) VALUES ($1, $2)", [input.id, input.title]);
  }

  async appendEvent(input: EventInput): Promise<void> {
    await this.db.query(
      "INSERT INTO events (run_id, node_id, type, payload) VALUES ($1, $2, $3, $4)",
      [input.runId, input.nodeId ?? null, input.type, JSON.stringify(input.payload)],
    );
  }
}
