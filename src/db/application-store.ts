import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ApiStore } from "../api/server.js";
import { mvpWorkflow } from "../workflow/mvp-workflow.js";
import { GraphRepository } from "./graph-repository.js";

export class PostgresApplicationStore implements ApiStore {
  constructor(private readonly db: Pool) {}

  async createTask(input: { repository: string; title: string; description: string }): Promise<string> {
    const id = randomUUID();
    await this.db.query("INSERT INTO runs (id, title) VALUES ($1, $2)", [id, input.title]);
    const nodes = mvpWorkflow.nodes.map((node, index) => ({ id: `${id}-node-${index + 1}`, runId: id, kind: node.kind, name: node.name, input: { repository: input.repository, description: input.description } }));
    const repository = new GraphRepository(this.db);
    for (const node of nodes) await repository.createNode(node);
    for (let index = 0; index < nodes.length - 1; index++) await repository.createEdge(nodes[index].id, nodes[index + 1].id);
    await repository.appendEvent({ runId: id, type: "run_created", payload: { repository: input.repository } });
    return id;
  }

  async getRun(id: string): Promise<unknown> {
    const result = await this.db.query(
      "SELECT r.id, r.title, r.status, r.created_at, COALESCE(json_agg(n ORDER BY n.created_at) FILTER (WHERE n.id IS NOT NULL), '[]') AS nodes FROM runs r LEFT JOIN nodes n ON n.run_id = r.id WHERE r.id = $1 GROUP BY r.id",
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getEvents(id: string): Promise<unknown[]> {
    const result = await this.db.query("SELECT * FROM events WHERE run_id = $1 ORDER BY created_at, id", [id]);
    return result.rows;
  }

  async cancelRun(id: string): Promise<void> {
    await this.db.query("UPDATE runs SET status = 'cancelled' WHERE id = $1", [id]);
    await this.db.query("UPDATE nodes SET status = 'cancelled', updated_at = now() WHERE run_id = $1 AND status IN ('pending', 'leased', 'running')", [id]);
  }

  async retryNode(id: string): Promise<void> {
    await this.db.query("UPDATE nodes SET status = 'pending', error = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1", [id]);
  }
}
