import type { FactoryProjection } from "../../db/factory-projection.js";

export function createProjectionActivities(projection: FactoryProjection) {
  return {
    async recordRunProjection(input: {
      runId: string;
      workflowId: string;
      taskId: string;
      status: string;
      currentNode?: string;
      failureReason?: string;
    }) {
      await projection.recordRun(input);
    },

    async recordNodeAttempt(input: {
      runId: string;
      attemptId: string;
      node: string;
      status: string;
      startedAt: string;
      completedAt?: string;
      failureCode?: string;
      evidenceManifestHash?: string;
    }) {
      await projection.recordNodeAttempt(input);
    },

    async recordFactoryEvent(input: { runId: string; eventId: string; type: string; payload: unknown }) {
      await projection.recordEvent(input);
    },
  };
}
