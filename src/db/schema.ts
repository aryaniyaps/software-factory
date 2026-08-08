import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const a2aTasks = pgTable("a2a_tasks", {
  taskId: text("task_id").primaryKey(),
  contextId: text("context_id").notNull(),
  task: jsonb("task").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const githubInstallations = pgTable("github_installations", {
  installationId: integer("installation_id").primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
