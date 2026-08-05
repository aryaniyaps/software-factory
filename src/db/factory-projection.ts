export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface FactoryProjection {
  recordRun(input: { runId: string; workflowId: string; taskId: string; status: string; currentNode?: string; failureReason?: string }): Promise<void>;
  recordEvent(input: { runId: string; eventId: string; type: string; payload: unknown }): Promise<void>;
  recordArtifact(input: { runId: string; digest: string; image: string }): Promise<void>;
  recordDeployment(input: { runId: string; profile: string; digest: string; status: string }): Promise<void>;
}

export function createFactoryProjection(db: Queryable): FactoryProjection {
  return {
    async recordRun(input) {
      await db.query(`INSERT INTO factory_runs (run_id, workflow_id, task_id, status, current_node, failure_reason, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (run_id) DO UPDATE SET workflow_id = EXCLUDED.workflow_id, task_id = EXCLUDED.task_id, status = EXCLUDED.status, current_node = EXCLUDED.current_node, failure_reason = EXCLUDED.failure_reason, updated_at = now()`, [input.runId, input.workflowId, input.taskId, input.status, input.currentNode ?? null, input.failureReason ?? null]);
    },
    async recordEvent(input) {
      await db.query(`INSERT INTO factory_events (run_id, event_id, type, payload)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (run_id, event_id) DO NOTHING`, [input.runId, input.eventId, input.type, input.payload]);
    },
    async recordArtifact(input) {
      await db.query(`INSERT INTO factory_artifacts (run_id, digest, image)
        VALUES ($1, $2, $3)
        ON CONFLICT (run_id, digest) DO UPDATE SET image = EXCLUDED.image`, [input.runId, input.digest, input.image]);
    },
    async recordDeployment(input) {
      await db.query(`INSERT INTO factory_deployments (run_id, profile, digest, status, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (run_id, profile) DO UPDATE SET digest = EXCLUDED.digest, status = EXCLUDED.status, updated_at = now()`, [input.runId, input.profile, input.digest, input.status]);
    },
  };
}
