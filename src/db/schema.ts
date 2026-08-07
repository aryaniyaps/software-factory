import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const factoryRuns = pgTable("factory_runs", {
  runId: text("run_id").primaryKey(),
  workflowId: text("workflow_id").notNull().unique(),
  taskId: text("task_id").notNull(),
  status: text("status").notNull(),
  currentNode: text("current_node"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const factoryEvents = pgTable(
  "factory_events",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.eventId] })],
);

export const factoryArtifacts = pgTable(
  "factory_artifacts",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    digest: text("digest").notNull(),
    image: text("image").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.digest] })],
);

export const factoryDeployments = pgTable(
  "factory_deployments",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    profile: text("profile").notNull(),
    digest: text("digest").notNull(),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.profile] })],
);

export const factoryNodeAttempts = pgTable(
  "factory_node_attempts",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    attemptId: text("attempt_id").notNull(),
    node: text("node").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    evidenceManifestHash: text("evidence_manifest_hash"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.attemptId] })],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    role: text("role").notNull(),
    nodeAttemptId: text("node_attempt_id"),
    model: text("model"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.sessionId] })],
);

export const agentTurns = pgTable(
  "agent_turns",
  {
    runId: text("run_id").notNull(),
    sessionId: text("session_id").notNull(),
    turnId: text("turn_id").notNull(),
    turnIndex: integer("turn_index").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    transcriptUri: text("transcript_uri"),
    transcriptSha256: text("transcript_sha256"),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sessionId, table.turnId] }),
    foreignKey({
      columns: [table.runId, table.sessionId],
      foreignColumns: [agentSessions.runId, agentSessions.sessionId],
    }).onDelete("cascade"),
  ],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    runId: text("run_id").notNull(),
    sessionId: text("session_id").notNull(),
    turnId: text("turn_id").notNull(),
    callId: text("call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status").notNull(),
    inputSha256: text("input_sha256").notNull(),
    outputSha256: text("output_sha256"),
    inputUri: text("input_uri").notNull(),
    outputUri: text("output_uri"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sessionId, table.turnId, table.callId] }),
    foreignKey({
      columns: [table.runId, table.sessionId, table.turnId],
      foreignColumns: [agentTurns.runId, agentTurns.sessionId, agentTurns.turnId],
    }).onDelete("cascade"),
  ],
);

export const factoryMessages = pgTable(
  "factory_messages",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    threadId: text("thread_id").notNull(),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    sender: jsonb("sender").notNull(),
    recipients: jsonb("recipients").notNull(),
    body: text("body").notNull(),
    replyTo: text("reply_to"),
    requestId: text("request_id"),
    stateRevision: integer("state_revision").notNull(),
    repositoryRevision: text("repository_revision"),
    artifactRefs: jsonb("artifact_refs").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.messageId] }),
    uniqueIndex("factory_messages_thread_sequence_uidx").on(table.runId, table.threadId, table.sequence),
  ],
);

export const factoryClarifications = pgTable(
  "factory_clarifications",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    threadId: text("thread_id").notNull(),
    requestingNode: text("requesting_node").notNull(),
    recipient: jsonb("recipient").notNull(),
    question: text("question").notNull(),
    stateRevision: integer("state_revision").notNull(),
    status: text("status").notNull(),
    answer: jsonb("answer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.requestId] }),
    index("factory_clarifications_status_idx").on(table.runId, table.status),
  ],
);

export const factoryClaimRevisions = pgTable(
  "factory_claim_revisions",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    claimId: text("claim_id").notNull(),
    revision: integer("revision").notNull(),
    status: text("status").notNull(),
    author: jsonb("author").notNull(),
    valueRef: jsonb("value_ref").notNull(),
    dependsOn: jsonb("depends_on").notNull().default([]),
    supersedes: jsonb("supersedes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.claimId, table.revision] }),
  ],
);

export const a2aTasks = pgTable("a2a_tasks", {
  taskId: text("task_id").primaryKey(),
  contextId: text("context_id").notNull(),
  task: jsonb("task").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evidenceItems = pgTable(
  "evidence_items",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    schemaVersion: text("schema_version").notNull(),
    mediaType: text("media_type").notNull(),
    sha256: text("sha256").notNull(),
    uri: text("uri").notNull(),
    producerType: text("producer_type").notNull(),
    producerId: text("producer_id").notNull(),
    producerVersion: text("producer_version").notNull(),
    subject: jsonb("subject").notNull().default({}),
    redaction: text("redaction").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.id] }),
    index("evidence_items_run_created_idx").on(table.runId, table.createdAt),
  ],
);

export const gateDecisions = pgTable(
  "gate_decisions",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    gateId: text("gate_id").notNull(),
    decision: text("decision").notNull(),
    policyVersion: text("policy_version").notNull(),
    reasons: jsonb("reasons").notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.gateId, table.decidedAt] }),
    index("gate_decisions_run_decided_idx").on(table.runId, table.decidedAt),
  ],
);

export const scenarioRuns = pgTable(
  "scenario_runs",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    status: text("status").notNull(),
    satisfaction: real("satisfaction"),
    trajectoryUri: text("trajectory_uri"),
    trajectorySha256: text("trajectory_sha256"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.runId, table.scenarioId, table.attemptId] })],
);

export const fitnessResults = pgTable(
  "fitness_results",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    adapter: text("adapter").notNull(),
    status: text("status").notNull(),
    reportUri: text("report_uri"),
    reportSha256: text("report_sha256"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.ruleId, table.recordedAt] })],
);

export const deploymentObservations = pgTable(
  "deployment_observations",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    profile: text("profile").notNull(),
    observationId: text("observation_id").notNull(),
    status: text("status").notNull(),
    signalUri: text("signal_uri"),
    signalSha256: text("signal_sha256"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.profile, table.observationId] })],
);

export const incidentLinks = pgTable(
  "incident_links",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    incidentId: text("incident_id").notNull(),
    source: text("source").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.incidentId] })],
);

export const feedbackItems = pgTable(
  "feedback_items",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    feedbackId: text("feedback_id").notNull(),
    source: text("source").notNull(),
    summary: text("summary").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.feedbackId] })],
);

export const oracleCalibrations = pgTable(
  "oracle_calibrations",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    oracleId: text("oracle_id").notNull(),
    calibrationId: text("calibration_id").notNull(),
    score: real("score").notNull(),
    reportUri: text("report_uri"),
    reportSha256: text("report_sha256"),
    calibratedAt: timestamp("calibrated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.oracleId, table.calibrationId] })],
);

export const evidenceManifests = pgTable("evidence_manifests", {
  runId: text("run_id")
    .primaryKey()
    .references(() => factoryRuns.runId, { onDelete: "cascade" }),
  manifestHash: text("manifest_hash").notNull(),
  manifest: jsonb("manifest").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const factoryEventOutbox = pgTable(
  "factory_event_outbox",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.eventId] }),
    index("factory_event_outbox_run_created_idx").on(table.runId, table.createdAt),
  ],
);

export const probeRuns = pgTable(
  "probe_runs",
  {
    runId: text("run_id")
      .notNull()
      .references(() => factoryRuns.runId, { onDelete: "cascade" }),
    probeId: text("probe_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    status: text("status").notNull(),
    record: jsonb("record").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.probeId, table.attemptId] }),
    index("probe_runs_run_recorded_idx").on(table.runId, table.recordedAt),
  ],
);
