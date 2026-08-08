import { createApiServer } from "./api/server.js";
import { createExecutionsService } from "./api/executions-service.js";
import { closePool, createDatabase, createPool } from "./db/database.js";
import { runMigrations } from "./db/migrate.js";
import { createTemporalClient } from "./temporal/client.js";
import { loadFactoryConfig } from "./config.js";
import { shutdownTelemetry } from "./telemetry/bootstrap.js";
import { createA2AServer } from "./api/a2a-server.js";
import { createA2ATaskStore } from "./db/a2a-task-store.js";
import { createGitHubInstallationStore } from "./db/github-installation-store.js";
import { createGitHubAppService, loadGitHubAppConfig } from "./integrations/github-app.js";
import { createFilesystemObjectStore } from "./evidence/object-store.js";

export async function startServer(): Promise<void> {
  const config = loadFactoryConfig();
  if (!config.apiToken) {
    throw new Error("FACTORY_API_TOKEN is required to start the Software Factory API");
  }
  await runMigrations();
  const pool = createPool();
  const db = createDatabase(pool);
  const githubConfig = await loadGitHubAppConfig();
  const githubInstallations = createGitHubInstallationStore(db);
  const github = githubConfig ? createGitHubAppService(githubConfig, githubInstallations) : undefined;
  if (github) await github.bootstrapFromEnv();
  const temporal = await createTemporalClient();
  const executions = createExecutionsService({
    workflowClient: temporal,
    objectStore: createFilesystemObjectStore(
      process.env.EVIDENCE_OBJECT_STORE_ROOT ?? "/tmp/software-factory-evidence",
    ),
  });
  const server = createApiServer({
    executions,
    apiToken: config.apiToken,
    github,
    githubWebhookSecret: githubConfig?.webhookSecret,
  });
  const port = Number(process.env.FACTORY_PORT ?? 8787);
  const a2aPort = Number(process.env.FACTORY_A2A_PORT ?? 8788);
  const a2aToken = process.env.FACTORY_A2A_TOKEN ?? config.apiToken;
  if (!a2aToken) {
    throw new Error("FACTORY_A2A_TOKEN or FACTORY_API_TOKEN is required to start the A2A endpoint");
  }
  const a2aServer = createA2AServer({
    executions,
    publicUrl: process.env.FACTORY_A2A_PUBLIC_URL ?? `http://127.0.0.1:${a2aPort}`,
    apiToken: a2aToken,
    taskStore: createA2ATaskStore(db),
  });

  server.listen(
    port,
    process.env.FACTORY_HOST ?? "127.0.0.1",
    () => console.log(`software-factory listening on :${port}`),
  );
  a2aServer.listen(
    a2aPort,
    process.env.FACTORY_A2A_HOST ?? "127.0.0.1",
    () => console.log(`software-factory A2A listening on :${a2aPort}`),
  );

  async function close(): Promise<void> {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await new Promise<void>((resolve, reject) => a2aServer.close((error) => error ? reject(error) : resolve()));
    await closePool(pool);
    await shutdownTelemetry();
  }

  process.once("SIGTERM", () => { void close(); });
  process.once("SIGINT", () => { void close(); });
}
