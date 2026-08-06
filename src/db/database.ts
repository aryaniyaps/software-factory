import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return new Pool({ connectionString });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

export async function closePool(pool: Pool): Promise<void> {
  await pool.end();
}
