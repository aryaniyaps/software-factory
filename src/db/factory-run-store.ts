import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { ApiStore } from "../api/server.js";
import type { Database } from "./database.js";
import { createFactoryProjection } from "./factory-projection.js";
import { factoryEvents } from "./schema.js";

export function createFactoryRunStore(db: Database): ApiStore {
  const projection = createFactoryProjection(db);

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
      const events = await db
        .select({
          event_id: factoryEvents.eventId,
          type: factoryEvents.type,
          payload: factoryEvents.payload,
          created_at: factoryEvents.createdAt,
        })
        .from(factoryEvents)
        .where(eq(factoryEvents.runId, id))
        .orderBy(asc(factoryEvents.createdAt), asc(factoryEvents.eventId));
      return { ...run, events };
    },

    async getEvents(id: string) {
      return db
        .select({
          event_id: factoryEvents.eventId,
          type: factoryEvents.type,
          payload: factoryEvents.payload,
          created_at: factoryEvents.createdAt,
        })
        .from(factoryEvents)
        .where(eq(factoryEvents.runId, id))
        .orderBy(asc(factoryEvents.createdAt), asc(factoryEvents.eventId));
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
