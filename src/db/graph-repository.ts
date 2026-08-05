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

export interface NodeInput {
  id: string;
  runId: string;
  kind: "deterministic" | "agent";
  name: string;
  input: unknown;
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

  async createNode(input: NodeInput): Promise<void> {
    await this.db.query(
      "INSERT INTO nodes (id, run_id, kind, name, input) VALUES ($1, $2, $3, $4, $5)",
      [input.id, input.runId, input.kind, input.name, JSON.stringify(input.input)],
    );
  }

  async createEdge(fromNodeId: string, toNodeId: string): Promise<void> {
    await this.db.query("INSERT INTO edges (from_node_id, to_node_id) VALUES ($1, $2)", [fromNodeId, toNodeId]);
  }

  async leaseReady(workerId: string, limit: number, leaseMs: number): Promise<unknown[]> {
    const result = await this.db.query(
      `WITH ready AS (
        SELECT n.id FROM nodes n
        WHERE n.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM edges e JOIN nodes p ON p.id = e.from_node_id
            WHERE e.to_node_id = n.id AND p.status <> 'succeeded'
          )
        ORDER BY n.id
        FOR UPDATE OF n SKIP LOCKED
        LIMIT $1
      )
      UPDATE nodes n
      SET status = 'leased', lease_owner = $2, lease_expires_at = now() + ($3 * interval '1 millisecond'), updated_at = now()
      FROM ready WHERE n.id = ready.id
      RETURNING n.*`,
      [limit, workerId, leaseMs],
    );
    return result.rows;
  }

  async completeNode(id: string, output: unknown): Promise<void> {
    await this.db.query("UPDATE nodes SET status = 'succeeded', output = $2, lease_owner = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1", [id, JSON.stringify(output)]);
  }

  async failNode(id: string, error: string): Promise<void> {
    await this.db.query("UPDATE nodes SET status = 'failed', error = $2, lease_owner = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1", [id, error]);
  }
}
