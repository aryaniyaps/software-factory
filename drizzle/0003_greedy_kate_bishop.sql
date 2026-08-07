CREATE TABLE "a2a_tasks" (
	"task_id" text PRIMARY KEY NOT NULL,
	"context_id" text NOT NULL,
	"task" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
