import { readFile } from "node:fs/promises";
import { createApiServer } from "./api/server.js";
import { createProductionApi } from "./api/production-api.js";
import { createEvidenceService } from "./api/evidence-service.js";
import { createOperationsService } from "./api/operations-service.js";
import { createPool } from "./db/database.js";
import { PostgresApplicationStore } from "./db/application-store.js";
import { createEvidenceReadModel } from "./db/evidence-read-model.js";
import { createTemporalClient } from "./temporal/client.js";
import { loadFactoryConfig } from "./config.js";
import { shutdownTelemetry } from "./telemetry/bootstrap.js";

export async function startServer(): Promise<void> {
  const config = loadFactoryConfig();
  const pool = createPool();
  await pool.query(await readFile(new URL("./db/schema.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./db/migrations/002_evidence_spine.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./db/migrations/003_probe_runs.sql", import.meta.url), "utf8"));
  const temporal = await createTemporalClient();
  const store = new PostgresApplicationStore(pool);
  const evidenceService = createEvidenceService({
    readModel: createEvidenceReadModel(pool),
    config: {
      retentionDays: config.evidenceRetentionDays,
      signedUrls: {
        secret: config.signedUrlSecret,
        ttlSeconds: config.signedUrlTtlSeconds,
        baseUrl: config.publicBaseUrl,
      },
    },
  });
  const operationsService = createOperationsService({ workflowClient: temporal });
  const server = createApiServer({
    store: createProductionApi({ store, workflowClient: temporal }),
    evidenceService,
    operationsService,
    signedUrls: {
      secret: config.signedUrlSecret,
      ttlSeconds: config.signedUrlTtlSeconds,
      baseUrl: config.publicBaseUrl,
    },
    apiToken: config.apiToken,
  });
  const port = Number(process.env.FACTORY_PORT ?? 8787);

  server.listen(port, () => console.log(`software-factory listening on :${port}`));

  async function close(): Promise<void> {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
    await shutdownTelemetry();
  }

  process.once("SIGTERM", () => { void close(); });
  process.once("SIGINT", () => { void close(); });
}
