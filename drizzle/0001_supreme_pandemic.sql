CREATE TABLE "factory_claim_revisions" (
	"run_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text NOT NULL,
	"author" jsonb NOT NULL,
	"value_ref" jsonb NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supersedes" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "factory_claim_revisions_run_id_claim_id_revision_pk" PRIMARY KEY("run_id","claim_id","revision")
);
--> statement-breakpoint
CREATE TABLE "factory_clarifications" (
	"run_id" text NOT NULL,
	"request_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"requesting_node" text NOT NULL,
	"recipient" jsonb NOT NULL,
	"question" text NOT NULL,
	"state_revision" integer NOT NULL,
	"status" text NOT NULL,
	"answer" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "factory_clarifications_run_id_request_id_pk" PRIMARY KEY("run_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "factory_messages" (
	"run_id" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"sender" jsonb NOT NULL,
	"recipients" jsonb NOT NULL,
	"body" text NOT NULL,
	"reply_to" text,
	"request_id" text,
	"state_revision" integer NOT NULL,
	"repository_revision" text,
	"artifact_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "factory_messages_run_id_message_id_pk" PRIMARY KEY("run_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "factory_claim_revisions" ADD CONSTRAINT "factory_claim_revisions_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_clarifications" ADD CONSTRAINT "factory_clarifications_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_messages" ADD CONSTRAINT "factory_messages_run_id_factory_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."factory_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factory_clarifications_status_idx" ON "factory_clarifications" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "factory_messages_thread_sequence_idx" ON "factory_messages" USING btree ("run_id","thread_id","sequence");