import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { closePool, createDatabase, createPool } from "../../src/db/database.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? "postgres://factory:factory@localhost:5433/factory";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

const TEST_DB_LOCK_KEY = 42_424_242;

let sharedPool: Pool | null = null;
let postgresAvailable: boolean | undefined;

export async function isPostgresAvailable(): Promise<boolean> {
  if (postgresAvailable !== undefined) return postgresAvailable;
  const probe = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await probe.query("SELECT 1");
    postgresAvailable = true;
  } catch {
    postgresAvailable = false;
  } finally {
    await probe.end();
  }
  return postgresAvailable;
}

export async function getTestPool(): Promise<Pool> {
  if (!sharedPool) {
    sharedPool = createPool(TEST_DATABASE_URL);
  }
  return sharedPool;
}

export async function getTestDatabase() {
  return createDatabase(await getTestPool());
}

export async function rebuildTestDatabase(): Promise<void> {
  const pool = await getTestPool();
  await pool.query("SELECT pg_advisory_lock($1)", [TEST_DB_LOCK_KEY]);
  try {
    await pool.query(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
      GRANT ALL ON SCHEMA public TO CURRENT_USER;
    `);
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [TEST_DB_LOCK_KEY]);
  }
}

export async function resetTestDatabase(): Promise<void> {
  const pool = await getTestPool();
  await pool.query("SELECT pg_advisory_lock($1)", [TEST_DB_LOCK_KEY]);
  try {
    const { rows } = await pool.query<{ reg: string | null }>(
      "SELECT to_regclass('public.factory_runs') AS reg",
    );
    if (rows[0]?.reg) return;

    await pool.query(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
      GRANT ALL ON SCHEMA public TO CURRENT_USER;
    `);
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [TEST_DB_LOCK_KEY]);
  }
}

export async function truncateTestTables(): Promise<void> {
  const pool = await getTestPool();
  await pool.query("SELECT pg_advisory_lock($1)", [TEST_DB_LOCK_KEY]);
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (rows.length === 0) return;
    const tableList = rows.map((row) => `"${row.tablename}"`).join(", ");
    await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [TEST_DB_LOCK_KEY]);
  }
}

export async function closeTestDatabase(): Promise<void> {
  if (sharedPool) {
    await closePool(sharedPool);
    sharedPool = null;
  }
}
