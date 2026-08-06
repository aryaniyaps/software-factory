CREATE TABLE "agent_sessions" (
	"run_id" text NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"node_attempt_id" text,
	"model" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_run_id_session_id_pk" PRIMARY KEY("run_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "agent_turns" (
	"run_id" text NOT NULL,
	"session_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"turn_index" integer NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"transcript_uri" text,
	"transcript_sha256" text,
	CONSTRAINT "agent_turns_run_id_session_id_turn_id_pk" PRIMARY KEY("run_id","session_id","turn_id")
);
--> statement-breakpoint
CREATE TABLE "deployment_observations" (
	"run_id" text NOT NULL,
	"profile" text NOT NULL,
	"observation_id" text NOT NULL,
	"status" text NOT NULL,
	"signal_uri" text,
	"signal_sha256" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_observations_run_id_profile_observation_id_pk" PRIMARY KEY("run_id","profile","observation_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"run_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"schema_version" text NOT NULL,
	"media_type" text NOT NULL,
	"sha256" text NOT NULL,
	"uri" text NOT NULL,
	"producer_type" text NOT NULL,
	"producer_id" text NOT NULL,
	"producer_version" text NOT NULL,
	"subject" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"redaction" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "evidence_items_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "evidence_manifests" (
	"run_id" text PRIMARY KEY NOT NULL,
	"manifest_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factory_artifacts" (
	"run_id" text NOT NULL,
	"digest" text NOT NULL,
	"image" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factory_artifacts_run_id_digest_pk" PRIMARY KEY("run_id","digest")
);
--> statement-breakpoint
CREATE TABLE "factory_deployments" (
	"run_id" text NOT NULL,
	"profile" text NOT NULL,
	"digest" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factory_deployments_run_id_profile_pk" PRIMARY KEY("run_id","profile")
);
--> statement-breakpoint
CREATE TABLE "factory_event_outbox" (
	"run_id" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factory_event_outbox_run_id_event_id_pk" PRIMARY KEY("run_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "factory_events" (
	"run_id" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factory_events_run_id_event_id_pk" PRIMARY KEY("run_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "factory_node_attempts" (
	"run_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"node" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"evidence_manifest_hash" text,
	CONSTRAINT "factory_node_attempts_run_id_attempt_id_pk" PRIMARY KEY("run_id","attempt_id")
);
--> statement-breakpoint
CREATE TABLE "factory_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"task_id" text NOT NULL,
	"status" text NOT NULL,
	"current_node" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factory_runs_workflow_id_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"run_id" text NOT NULL,
	"feedback_id" text NOT NULL,
	"source" text NOT NULL,
	"summary" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_items_run_id_feedback_id_pk" PRIMARY KEY("run_id","feedback_id")
);
--> statement-breakpoint
CREATE TABLE "fitness_results" (
	"run_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"adapter" text NOT NULL,
	"status" text NOT NULL,
	"report_uri" text,
	"report_sha256" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fitness_results_run_id_rule_id_recorded_at_pk" PRIMARY KEY("run_id","rule_id","recorded_at")
);
--> statement-breakpoint
CREATE TABLE "gate_decisions" (
	"run_id" text NOT NULL,
	"gate_id" text NOT NULL,
	"decision" text NOT NULL,
	"policy_version" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_decisions_run_id_gate_id_decided_at_pk" PRIMARY KEY("run_id","gate_id","decided_at")
);
--> statement-breakpoint
CREATE TABLE "incident_links" (
	"run_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"source" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_links_run_id_incident_id_pk" PRIMARY KEY("run_id","incident_id")
);
--> statement-breakpoint
CREATE TABLE "oracle_calibrations" (
	"run_id" text NOT NULL,
	"oracle_id" text NOT NULL,
	"calibration_id" text NOT NULL,
	"score" real NOT NULL,
	"report_uri" text,
	"report_sha256" text,
	"calibrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oracle_calibrations_run_id_oracle_id_calibration_id_pk" PRIMARY KEY("run_id","oracle_id","calibration_id")
);
--> statement-breakpoint
CREATE TABLE "probe_runs" (
	"run_id" text NOT NULL,
	"probe_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"status" text NOT NULL,
	"record" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probe_runs_run_id_probe_id_attempt_id_pk" PRIMARY KEY("run_id","probe_id","attempt_id")
);
--> statement-breakpoint
CREATE TABLE "scenario_runs" (
	"run_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"status" text NOT NULL,
	"satisfaction" real,
	"trajectory_uri" text,
	"trajectory_sha256" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "scenario_runs_run_id_scenario_id_attempt_id_pk" PRIMARY KEY("run_id","scenario_id","attempt_id")
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"run_id" text NOT NULL,
	"session_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"input_sha256" text NOT NULL,
	"output_sha256" text,
	"input_uri" text NOT NULL,
	"output_uri" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tool_calls_run_id_session_id_turn_id_call_id_pk" PRIMARY KEY("run_id","session_id","turn_id","call_id")
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_run_id_session_id_agent_sessions_run_id_session_id_fk" FOREIGN KEY ("run_id","session_id") REFERENCES "public"."agent_sessions"("run_id","session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_observations" ADD CONSTRAINT "deployment_observations_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_manifests" ADD CONSTRAINT "evidence_manifests_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_artifacts" ADD CONSTRAINT "factory_artifacts_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_deployments" ADD CONSTRAINT "factory_deployments_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_event_outbox" ADD CONSTRAINT "factory_event_outbox_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_events" ADD CONSTRAINT "factory_events_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_node_attempts" ADD CONSTRAINT "factory_node_attempts_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitness_results" ADD CONSTRAINT "fitness_results_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD CONSTRAINT "gate_decisions_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_calibrations" ADD CONSTRAINT "oracle_calibrations_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_runs" ADD CONSTRAINT "probe_runs_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_runs" ADD CONSTRAINT "scenario_runs_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_run_id_session_id_turn_id_agent_turns_run_id_session_id_turn_id_fk" FOREIGN KEY ("run_id","session_id","turn_id") REFERENCES "public"."agent_turns"("run_id","session_id","turn_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_items_run_created_idx" ON "evidence_items" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "factory_event_outbox_run_created_idx" ON "factory_event_outbox" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "gate_decisions_run_decided_idx" ON "gate_decisions" USING btree ("run_id","decided_at");--> statement-breakpoint
CREATE INDEX "probe_runs_run_recorded_idx" ON "probe_runs" USING btree ("run_id","recorded_at");