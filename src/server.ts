import { readFile } from "node:fs/promises";
import { createApiServer } from "./api/server.js";
import { createProductionApi } from "./api/production-api.js";
import { createPool } from "./db/database.js";
import { PostgresApplicationStore } from "./db/application-store.js";
import { createTemporalClient } from "./temporal/client.js";

const pool = createPool();
await pool.query(await readFile(new URL("./db/schema.sql", import.meta.url), "utf8"));
await pool.query(await readFile(new URL("./db/migrations/002_evidence_spine.sql", import.meta.url), "utf8"));
const temporal = await createTemporalClient();
const store = new PostgresApplicationStore(pool);
const server = createApiServer(createProductionApi({ store, workflowClient: temporal }));
const port = Number(process.env.FACTORY_PORT ?? 8787);

server.listen(port, () => console.log(`software-factory listening on :${port}`));

async function close(): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
}

process.once("SIGTERM", () => { void close(); });
process.once("SIGINT", () => { void close(); });
