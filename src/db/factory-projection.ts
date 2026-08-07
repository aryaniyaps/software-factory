import { and, asc, desc, eq } from "drizzle-orm";
import type { EvidenceKind, EvidenceRef } from "../contracts/evidence.js";
import type { EvidenceManifest } from "../evidence/manifest.js";
import type { FeedbackTraceability } from "../feedback/types.js";
import type { Database } from "./database.js";
import {
  evidenceItems,
  evidenceManifests,
  factoryArtifacts,
  factoryClarifications,
  factoryMessages,
  factoryDeployments,
  factoryEvents,
  factoryEventOutbox,
  factoryNodeAttempts,
  factoryRuns,
  feedbackItems,
  gateDecisions,
  incidentLinks,
  oracleCalibrations,
  probeRuns,
  scenarioRuns,
} from "./schema.js";

export interface FactoryRunRow {
  runId: string;
  workflowId: string;
  taskId: string;
  status: string;
  currentNode?: string;
  failureReason?: string;
}

export interface FactoryProjection {
  recordRun(input: { runId: string; workflowId: string; taskId: string; status: string; currentNode?: string; failureReason?: string }): Promise<void>;
  recordEvent(input: { runId: string; eventId: string; type: string; payload: unknown }): Promise<void>;
  recordEventOutbox(input: { runId: string; eventId: string; type: string; payload: unknown }): Promise<{ inserted: boolean }>;
  recordArtifact(input: { runId: string; digest: string; image: string }): Promise<void>;
  recordDeployment(input: { runId: string; profile: string; digest: string; status: string }): Promise<void>;
  recordEvidenceItem(input: {
    runId: string;
    id: string;
    kind: EvidenceKind;
    schemaVersion: string;
    mediaType: string;
    sha256: string;
    uri: string;
    producer: { type: string; id: string; version: string };
    subject: Record<string, string>;
    createdAt: string;
    redaction: "none" | "secrets" | "pii";
  }): Promise<void>;
  recordGateDecision(input: {
    runId: string;
    gateId: string;
    decision: string;
    policyVersion: string;
    reasons: unknown;
    evidenceRefs: readonly string[];
    decidedAt?: string;
  }): Promise<void>;
  recordEvidenceManifest(input: { runId: string; manifest: EvidenceManifest; hash: string }): Promise<void>;
  recordScenarioRun(input: {
    runId: string;
    scenarioId: string;
    attemptId: string;
    status: string;
    satisfaction?: number;
    trajectoryUri?: string;
    trajectorySha256?: string;
    startedAt: string;
    completedAt?: string;
  }): Promise<void>;
  recordProbeRun(input: {
    runId: string;
    probeId: string;
    attemptId: string;
    status: string;
    record: unknown;
    recordedAt?: string;
  }): Promise<void>;
  listEvidenceItemIds(runId: string): Promise<string[]>;
  listGateDecisionKeys(runId: string): Promise<string[]>;
  listScenarioRunKeys(runId: string): Promise<string[]>;
  recordFeedbackItem(input: { runId: string; feedbackId: string; source: string; summary: string }): Promise<{ inserted: boolean }>;
  recordIncidentLink(input: { runId: string; incidentId: string; source: string }): Promise<{ inserted: boolean }>;
  recordOracleCalibration(input: {
    runId: string;
    oracleId: string;
    calibrationId: string;
    score: number;
    reportUri?: string;
    reportSha256?: string;
  }): Promise<void>;
  getFeedbackTraceability(feedbackId: string): Promise<FeedbackTraceability | null>;
  getRun(runId: string): Promise<FactoryRunRow | null>;
  recordNodeAttempt(input: {
    runId: string;
    attemptId: string;
    node: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    failureCode?: string;
    evidenceManifestHash?: string;
  }): Promise<void>;
}

export function createFactoryProjection(db: Database): FactoryProjection {
  return {
    async recordRun(input) {
      await db.insert(factoryRuns).values({
        runId: input.runId,
        workflowId: input.workflowId,
        taskId: input.taskId,
        status: input.status,
        currentNode: input.currentNode ?? null,
        failureReason: input.failureReason ?? null,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: factoryRuns.runId,
        set: {
          workflowId: input.workflowId,
          taskId: input.taskId,
          status: input.status,
          currentNode: input.currentNode ?? null,
          failureReason: input.failureReason ?? null,
          updatedAt: new Date(),
        },
      });
    },

    async recordEvent(input) {
      await db.insert(factoryEvents).values({
        runId: input.runId,
        eventId: input.eventId,
        type: input.type,
        payload: input.payload,
      }).onConflictDoNothing({
        target: [factoryEvents.runId, factoryEvents.eventId],
      });
      await projectConversationEvent(db, input);
    },

    async recordEventOutbox(input) {
      return db.transaction(async (tx) => {
        const inserted = await tx.insert(factoryEventOutbox).values({
          runId: input.runId,
          eventId: input.eventId,
          type: input.type,
          payload: input.payload,
        }).onConflictDoNothing({
          target: [factoryEventOutbox.runId, factoryEventOutbox.eventId],
        }).returning({ eventId: factoryEventOutbox.eventId });

        if (inserted.length > 0) {
          await tx.insert(factoryEvents).values({
            runId: input.runId,
            eventId: input.eventId,
            type: input.type,
            payload: input.payload,
          }).onConflictDoNothing({
            target: [factoryEvents.runId, factoryEvents.eventId],
          });
        }

        return { inserted: inserted.length > 0 };
      });
    },

    async recordArtifact(input) {
      await db.insert(factoryArtifacts).values({
        runId: input.runId,
        digest: input.digest,
        image: input.image,
      }).onConflictDoUpdate({
        target: [factoryArtifacts.runId, factoryArtifacts.digest],
        set: { image: input.image },
      });
    },

    async recordDeployment(input) {
      await db.insert(factoryDeployments).values({
        runId: input.runId,
        profile: input.profile,
        digest: input.digest,
        status: input.status,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [factoryDeployments.runId, factoryDeployments.profile],
        set: {
          digest: input.digest,
          status: input.status,
          updatedAt: new Date(),
        },
      });
    },

    async recordEvidenceItem(input) {
      await db.insert(evidenceItems).values({
        runId: input.runId,
        id: input.id,
        kind: input.kind,
        schemaVersion: input.schemaVersion,
        mediaType: input.mediaType,
        sha256: input.sha256,
        uri: input.uri,
        producerType: input.producer.type,
        producerId: input.producer.id,
        producerVersion: input.producer.version,
        subject: input.subject,
        redaction: input.redaction,
        createdAt: new Date(input.createdAt),
      }).onConflictDoNothing({
        target: [evidenceItems.runId, evidenceItems.id],
      });
    },

    async recordGateDecision(input) {
      const decidedAt = new Date(input.decidedAt ?? new Date().toISOString());
      await db.insert(gateDecisions).values({
        runId: input.runId,
        gateId: input.gateId,
        decision: input.decision,
        policyVersion: input.policyVersion,
        reasons: input.reasons,
        evidenceRefs: [...input.evidenceRefs],
        decidedAt,
      }).onConflictDoNothing({
        target: [gateDecisions.runId, gateDecisions.gateId, gateDecisions.decidedAt],
      });
    },

    async recordEvidenceManifest(input) {
      await db.insert(evidenceManifests).values({
        runId: input.runId,
        manifestHash: input.hash,
        manifest: input.manifest,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: evidenceManifests.runId,
        set: {
          manifestHash: input.hash,
          manifest: input.manifest,
          updatedAt: new Date(),
        },
      });
    },

    async recordScenarioRun(input) {
      await db.insert(scenarioRuns).values({
        runId: input.runId,
        scenarioId: input.scenarioId,
        attemptId: input.attemptId,
        status: input.status,
        satisfaction: input.satisfaction ?? null,
        trajectoryUri: input.trajectoryUri ?? null,
        trajectorySha256: input.trajectorySha256 ?? null,
        startedAt: new Date(input.startedAt),
        completedAt: input.completedAt ? new Date(input.completedAt) : null,
      }).onConflictDoUpdate({
        target: [scenarioRuns.runId, scenarioRuns.scenarioId, scenarioRuns.attemptId],
        set: {
          status: input.status,
          satisfaction: input.satisfaction ?? null,
          trajectoryUri: input.trajectoryUri ?? null,
          trajectorySha256: input.trajectorySha256 ?? null,
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
        },
      });
    },

    async recordProbeRun(input) {
      const recordedAt = new Date(input.recordedAt ?? new Date().toISOString());
      await db.insert(probeRuns).values({
        runId: input.runId,
        probeId: input.probeId,
        attemptId: input.attemptId,
        status: input.status,
        record: input.record,
        recordedAt,
      }).onConflictDoUpdate({
        target: [probeRuns.runId, probeRuns.probeId, probeRuns.attemptId],
        set: {
          status: input.status,
          record: input.record,
          recordedAt,
        },
      });
    },

    async listEvidenceItemIds(runId) {
      const rows = await db
        .select({ id: evidenceItems.id })
        .from(evidenceItems)
        .where(eq(evidenceItems.runId, runId))
        .orderBy(asc(evidenceItems.createdAt), asc(evidenceItems.id));
      return rows.map((row) => row.id);
    },

    async listGateDecisionKeys(runId) {
      const rows = await db
        .select({ gateId: gateDecisions.gateId, decidedAt: gateDecisions.decidedAt })
        .from(gateDecisions)
        .where(eq(gateDecisions.runId, runId))
        .orderBy(asc(gateDecisions.decidedAt), asc(gateDecisions.gateId));
      return rows.map((row) => `${row.gateId}@${row.decidedAt.toISOString()}`);
    },

    async listScenarioRunKeys(runId) {
      const rows = await db
        .select({ scenarioId: scenarioRuns.scenarioId, attemptId: scenarioRuns.attemptId })
        .from(scenarioRuns)
        .where(eq(scenarioRuns.runId, runId))
        .orderBy(asc(scenarioRuns.startedAt), asc(scenarioRuns.scenarioId), asc(scenarioRuns.attemptId));
      return rows.map((row) => `${row.scenarioId}@${row.attemptId}`);
    },

    async recordFeedbackItem(input) {
      const inserted = await db.insert(feedbackItems).values({
        runId: input.runId,
        feedbackId: input.feedbackId,
        source: input.source,
        summary: input.summary,
      }).onConflictDoNothing({
        target: [feedbackItems.runId, feedbackItems.feedbackId],
      }).returning({ feedbackId: feedbackItems.feedbackId });
      return { inserted: inserted.length > 0 };
    },

    async recordIncidentLink(input) {
      const inserted = await db.insert(incidentLinks).values({
        runId: input.runId,
        incidentId: input.incidentId,
        source: input.source,
      }).onConflictDoNothing({
        target: [incidentLinks.runId, incidentLinks.incidentId],
      }).returning({ incidentId: incidentLinks.incidentId });
      return { inserted: inserted.length > 0 };
    },

    async recordOracleCalibration(input) {
      await db.insert(oracleCalibrations).values({
        runId: input.runId,
        oracleId: input.oracleId,
        calibrationId: input.calibrationId,
        score: input.score,
        reportUri: input.reportUri ?? null,
        reportSha256: input.reportSha256 ?? null,
      }).onConflictDoNothing({
        target: [oracleCalibrations.runId, oracleCalibrations.oracleId, oracleCalibrations.calibrationId],
      });
    },

    async getFeedbackTraceability(feedbackId) {
      const [feedback] = await db
        .select({
          runId: feedbackItems.runId,
          feedbackId: feedbackItems.feedbackId,
          source: feedbackItems.source,
        })
        .from(feedbackItems)
        .where(eq(feedbackItems.feedbackId, feedbackId))
        .limit(1);
      if (!feedback) return null;

      const [incident] = await db
        .select({ incidentId: incidentLinks.incidentId })
        .from(incidentLinks)
        .where(eq(incidentLinks.runId, feedback.runId))
        .orderBy(desc(incidentLinks.linkedAt))
        .limit(1);

      const [artifact] = await db
        .select({ digest: factoryArtifacts.digest })
        .from(factoryArtifacts)
        .where(eq(factoryArtifacts.runId, feedback.runId))
        .orderBy(asc(factoryArtifacts.digest))
        .limit(1);

      const [deployment] = await db
        .select({ digest: factoryDeployments.digest })
        .from(factoryDeployments)
        .where(eq(factoryDeployments.runId, feedback.runId))
        .orderBy(desc(factoryDeployments.updatedAt))
        .limit(1);

      const evidence = await db
        .select({ id: evidenceItems.id, sha256: evidenceItems.sha256, uri: evidenceItems.uri })
        .from(evidenceItems)
        .where(and(eq(evidenceItems.runId, feedback.runId), eq(evidenceItems.kind, "incident")))
        .orderBy(asc(evidenceItems.createdAt));

      const incidentId = incident?.incidentId;
      const artifactDigest = artifact?.digest ?? deployment?.digest;
      if (!incidentId || !artifactDigest) return null;

      const evidenceRefs: EvidenceRef[] = evidence.map((item) => ({
        schemaVersion: "evidence-ref.v1",
        id: item.id,
        sha256: item.sha256,
        uri: item.uri,
      }));

      return {
        feedbackId: feedback.feedbackId,
        incidentId,
        deploymentId: `${feedback.runId}-${artifactDigest}`,
        artifactDigest,
        runId: feedback.runId,
        evidenceRefs,
      };
    },

    async getRun(runId) {
      const [row] = await db
        .select({
          runId: factoryRuns.runId,
          workflowId: factoryRuns.workflowId,
          taskId: factoryRuns.taskId,
          status: factoryRuns.status,
          currentNode: factoryRuns.currentNode,
          failureReason: factoryRuns.failureReason,
        })
        .from(factoryRuns)
        .where(eq(factoryRuns.runId, runId))
        .limit(1);
      if (!row) return null;
      return {
        runId: row.runId,
        workflowId: row.workflowId,
        taskId: row.taskId,
        status: row.status,
        currentNode: row.currentNode ?? undefined,
        failureReason: row.failureReason ?? undefined,
      };
    },

    async recordNodeAttempt(input) {
      await db.insert(factoryNodeAttempts).values({
        runId: input.runId,
        attemptId: input.attemptId,
        node: input.node,
        status: input.status,
        startedAt: new Date(input.startedAt),
        completedAt: input.completedAt ? new Date(input.completedAt) : null,
        failureCode: input.failureCode ?? null,
        evidenceManifestHash: input.evidenceManifestHash ?? null,
      }).onConflictDoUpdate({
        target: [factoryNodeAttempts.runId, factoryNodeAttempts.attemptId],
        set: {
          node: input.node,
          status: input.status,
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
          failureCode: input.failureCode ?? null,
          evidenceManifestHash: input.evidenceManifestHash ?? null,
        },
      });
    },
  };
}

async function projectConversationEvent(
  db: Database,
  input: { runId: string; eventId: string; type: string; payload: unknown },
): Promise<void> {
  if (input.type === "clarification.requested") {
    const request = input.payload as {
      requestId: string;
      threadId: string;
      requestingNode: string;
      recipient: unknown;
      question: string;
      stateRevision: number;
      repositoryRevision?: string;
      contextRefs?: string[];
      createdAt: string;
      deadlineAt: string;
    };
    await db.insert(factoryClarifications).values({
      runId: input.runId,
      requestId: request.requestId,
      threadId: request.threadId,
      requestingNode: request.requestingNode,
      recipient: request.recipient,
      question: request.question,
      stateRevision: request.stateRevision,
      status: "open",
      createdAt: new Date(request.createdAt),
      deadlineAt: new Date(request.deadlineAt),
    }).onConflictDoNothing({
      target: [factoryClarifications.runId, factoryClarifications.requestId],
    });
    await db.insert(factoryMessages).values({
      runId: input.runId,
      messageId: `question:${request.requestId}`,
      threadId: request.threadId,
      sequence: request.stateRevision * 2,
      kind: "question",
      sender: { type: "node", id: request.requestingNode },
      recipients: [request.recipient],
      body: request.question,
      requestId: request.requestId,
      stateRevision: request.stateRevision,
      repositoryRevision: request.repositoryRevision ?? null,
      artifactRefs: request.contextRefs ?? [],
      createdAt: new Date(request.createdAt),
    }).onConflictDoNothing({
      target: [factoryMessages.runId, factoryMessages.messageId],
    });
    return;
  }

  if (input.type === "clarification.answered") {
    const answer = input.payload as {
      requestId: string;
      answerId: string;
      responder: unknown;
      body: string;
      stateRevision: number;
      artifactRefs?: string[];
      createdAt: string;
    };
    const [request] = await db.select().from(factoryClarifications).where(and(
      eq(factoryClarifications.runId, input.runId),
      eq(factoryClarifications.requestId, answer.requestId),
    )).limit(1);
    if (!request) return;
    await db.update(factoryClarifications).set({
      status: "answered",
      answer,
      answeredAt: new Date(answer.createdAt),
    }).where(and(
      eq(factoryClarifications.runId, input.runId),
      eq(factoryClarifications.requestId, answer.requestId),
    ));
    await db.insert(factoryMessages).values({
      runId: input.runId,
      messageId: `answer:${answer.answerId}`,
      threadId: request.threadId,
      sequence: request.stateRevision * 2 + 1,
      kind: "answer",
      sender: answer.responder,
      recipients: [{ type: "node", id: request.requestingNode }],
      body: answer.body,
      replyTo: `question:${answer.requestId}`,
      requestId: answer.requestId,
      stateRevision: answer.stateRevision,
      artifactRefs: answer.artifactRefs ?? [],
      createdAt: new Date(answer.createdAt),
    }).onConflictDoNothing({
      target: [factoryMessages.runId, factoryMessages.messageId],
    });
  }
}
