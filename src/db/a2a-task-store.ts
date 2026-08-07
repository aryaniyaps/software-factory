import type { ListTasksRequest, ListTasksResponse, Task } from "@a2a-js/sdk";
import type { ServerCallContext, TaskStore } from "@a2a-js/sdk/server";
import { and, count, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import type { Database } from "./database.js";
import { a2aTasks } from "./schema.js";

export interface FactoryA2ATaskStore extends TaskStore {
  runIdForTask(taskId: string): Promise<string | undefined>;
}

export function createA2ATaskStore(db: Database): FactoryA2ATaskStore {
  return {
    async save(task) {
      await db.insert(a2aTasks).values({
        taskId: task.id,
        contextId: task.contextId,
        task,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: a2aTasks.taskId,
        set: { contextId: task.contextId, task, updatedAt: new Date() },
      });
    },

    async load(taskId) {
      const [row] = await db.select().from(a2aTasks).where(eq(a2aTasks.taskId, taskId)).limit(1);
      return row?.task as Task | undefined;
    },

    async list(params: ListTasksRequest, _context: ServerCallContext): Promise<ListTasksResponse> {
      const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
      const offset = Math.max(0, Number.parseInt(params.pageToken || "0", 10) || 0);
      const filters: SQL[] = [];
      if (params.contextId) filters.push(eq(a2aTasks.contextId, params.contextId));
      if (params.status) {
        filters.push(sql`${a2aTasks.task}->'status'->>'state' = ${String(params.status)}`);
      }
      if (params.statusTimestampAfter) {
        filters.push(gte(a2aTasks.updatedAt, new Date(params.statusTimestampAfter)));
      }
      const where = filters.length ? and(...filters) : undefined;
      const rows = await db.select().from(a2aTasks)
        .where(where)
        .orderBy(desc(a2aTasks.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const [{ total = 0 } = {}] = await db.select({ total: count() }).from(a2aTasks).where(where);
      const tasks = rows.map((row) => {
        const task = structuredClone(row.task) as Task;
        if (params.historyLength !== undefined) {
          task.history = params.historyLength === 0
            ? []
            : task.history.slice(-params.historyLength);
        }
        if (!params.includeArtifacts) task.artifacts = [];
        return task;
      });
      const nextOffset = offset + tasks.length;
      return {
        tasks,
        pageSize,
        totalSize: total,
        nextPageToken: nextOffset < total ? String(nextOffset) : "",
      };
    },

    async runIdForTask(taskId) {
      const task = await this.load(taskId, {} as ServerCallContext);
      const runId = task?.metadata?.factoryRunId;
      return typeof runId === "string" ? runId : undefined;
    },
  };
}
