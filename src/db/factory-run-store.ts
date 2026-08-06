import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ApiStore } from "../api/server.js";
import { createFactoryProjection } from "./factory-projection.js";

export function createFactoryRunStore(pool: Pool): ApiStore {
  const projection = createFactoryProjection(pool);

  return {
    async createTask(input: { repository: string; title: string; description: string }) {
      const runId = randomUUID();
      const workflowId = `factory-${runId}`;
      await projection.recordRun({ runId, workflowId, taskId: runId, status: "pending" });
      await projection.recordEvent({
        runId,
        eventId: `task-created:${runId}`,
        type: "task.created",
        payload: { repository: input.repository, title: input.title, description: input.description },
      });
      return runId;
    },

    async getRun(id: string) {
      const run = await projection.getRun(id);
      if (!run) return null;
      const events = await pool.query(
        "SELECT event_id, type, payload, created_at FROM factory_events WHERE run_id = $1 ORDER BY created_at, event_id",
        [id],
      );
      return { ...run, events: events.rows };
    },

    async getEvents(id: string) {
      const result = await pool.query(
        "SELECT event_id, type, payload, created_at FROM factory_events WHERE run_id = $1 ORDER BY created_at, event_id",
        [id],
      );
      return result.rows;
    },

    async cancelRun(id: string) {
      await projection.recordRun({
        runId: id,
        workflowId: `factory-${id}`,
        taskId: id,
        status: "cancelled",
      });
    },
  };
}
