import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { closeTestDatabase, getTestPool, isPostgresAvailable, rebuildTestDatabase } from "./test-database.js";

const removedExecutionTables = [
  "factory_runs",
  "factory_events",
  "factory_artifacts",
  "factory_deployments",
  "factory_node_attempts",
  "agent_sessions",
  "agent_turns",
  "tool_calls",
  "evidence_items",
  "gate_decisions",
  "scenario_runs",
  "fitness_results",
  "deployment_observations",
  "incident_links",
  "feedback_items",
  "oracle_calibrations",
  "evidence_manifests",
  "factory_event_outbox",
  "probe_runs",
  "factory_messages",
  "factory_clarifications",
  "factory_claim_revisions",
];

const requiredTables = ["a2a_tasks", "github_installations"];

describe("migration smoke test", () => {
  let available = false;

  beforeAll(async () => {
    available = await isPostgresAvailable();
  }, 60_000);

  afterAll(async () => {
    if (available) await closeTestDatabase();
  });

  it("applies the generated baseline migration on disposable PostgreSQL", async ({ skip }) => {
    if (!available) skip();

    await rebuildTestDatabase();

    const schema = (await Promise.all([
      "0000_soft_otto_octavius.sql",
      "0001_supreme_pandemic.sql",
      "0002_bored_dark_beast.sql",
      "0003_greedy_kate_bishop.sql",
      "0004_github_installations.sql",
      "0006_temporal_execution_authority_generated.sql",
    ].map((file) => readFile(new URL(`../../drizzle/${file}`, import.meta.url), "utf8")))).join("\n");
    for (const table of removedExecutionTables) {
      expect(schema).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
    expect(schema).not.toMatch(/CREATE TABLE IF NOT EXISTS runs\b/);

    const pool = await getTestPool();
    const { rows } = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    expect(rows.map((row) => row.tablename)).toEqual(requiredTables);
    expect(rows.some((row) => row.tablename === "__drizzle_migrations")).toBe(false);
    expect((await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'drizzle'")).rowCount).toBe(1);
  });
});
