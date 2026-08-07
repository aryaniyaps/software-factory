import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createDatabase, createPool } from "../db/database.js";
import { runMigrations } from "../db/migrate.js";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import { assertHindsightCompatibility, HindsightMemory } from "../integrations/hindsight.js";
import { memoryBankFromEnv, memoryTags, resolveProjectBank, validateHindsightTemplate } from "../integrations/hindsight-config.js";
import { assembleAgentMemory, retainableAgentOutcome } from "../agents/memory.js";
import { createFactoryProjection } from "../db/factory-projection.js";
import { createAgentSessionLedger } from "../db/agent-session-ledger.js";
import { createFilesystemObjectStore } from "../evidence/object-store.js";
import { PiAgentRunner } from "../agents/pi-agent.js";
import { CrabboxWorkspaceProvider } from "../workspaces/crabbox-provider.js";
import { officialCrabboxRuntime } from "../workspaces/crabbox-runtime.js";
import { assertCrabboxAvailable } from "../workspaces/crabbox-doctor.js";
import { GitWorktreeManager } from "../workspaces/worktree-manager.js";
import { SshExecutor } from "../deploy/ssh-executor.js";
import { HealthChecker } from "../deploy/health-checker.js";
import { securityGate } from "../gates/security-gate.js";
import { createRepositoryActivities } from "./activities/repository.js";
import { createCrabboxActivityRuntime } from "./activities/crabbox.js";
import { createAgentActivities } from "./activities/agent.js";
import { createProjectionActivities } from "./activities/projection.js";
import { createProductionArtifactBuilder } from "../security/production-builder.js";
import { createBuildActivities } from "./activities/build.js";
import { createDeployActivities, type DeploymentTarget } from "./activities/deploy.js";
import type { FactoryWorkflowInput } from "./client.js";
import { createProductionWorkers } from "./worker-main.js";
import { instrumentActivities } from "../telemetry/bootstrap.js";
import { createVerifierActivities } from "./activities/verifier-impl.js";
import { createHealthActivities } from "./activities/health.js";
import { createMetaFactoryActivities } from "./activities/meta-factory.js";

const execFile = promisify(nodeExecFile);

type Environment = Record<string, string | undefined>;

export { memoryBankFromEnv } from "../integrations/hindsight-config.js";

export function deploymentTargetFromEnv(env: Environment = process.env): DeploymentTarget {
  if (!env.FACTORY_DEPLOY_HOST || !env.FACTORY_HEALTH_URL) throw new Error("FACTORY_DEPLOY_HOST and FACTORY_HEALTH_URL are required");
  return { host: env.FACTORY_DEPLOY_HOST, healthUrl: env.FACTORY_HEALTH_URL, previousDigest: env.FACTORY_PREVIOUS_DIGEST };
}

async function prepareRepository(repository: string): Promise<{ repository: string; revision: string }> {
  const root = process.env.REPOSITORY_CACHE_ROOT ?? "/tmp/software-factory-repositories";
  let path = repository;
  if (repository.startsWith("https://")) {
    await mkdir(root, { recursive: true });
    const name = repository.split("/").pop()?.replace(/\.git$/, "") || "repository";
    const key = createHash("sha256").update(repository).digest("hex").slice(0, 16);
    path = join(root, `${name}-${key}`);
    try {
      const { stdout: origin } = await execFile("git", ["-C", path, "remote", "get-url", "origin"], {
        timeout: 10_000,
      });
      if (origin.trim() !== repository) throw new Error("repository cache origin mismatch");
      await execFile("git", ["-C", path, "fetch", "--prune"]);
    } catch (error) {
      if (error instanceof Error && error.message === "repository cache origin mismatch") throw error;
      await execFile("git", ["clone", "--depth", "1", repository, path], { timeout: 120_000 });
    }
  }
  const { stdout } = await execFile("git", ["-C", path, "rev-parse", "HEAD"]);
  return { repository: path, revision: stdout.trim() };
}

export async function startWorkers(): Promise<void> {
  await assertCrabboxAvailable();
  await runMigrations();
  const pool = createPool();
  const db = createDatabase(pool);
  const projection = createFactoryProjection(db);
  const sessionLedger = createAgentSessionLedger(
    db,
    createFilesystemObjectStore(
      process.env.EVIDENCE_OBJECT_STORE_ROOT ?? "/tmp/software-factory-evidence",
    ),
  );
  const root = process.env.WORKTREE_ROOT ?? "/tmp/software-factory-worktrees";
  const workspace = new CrabboxWorkspaceProvider(officialCrabboxRuntime);
  const crabbox = createCrabboxActivityRuntime(workspace);
  const repository = createRepositoryActivities({ git: { prepare: prepareRepository }, worktrees: new GitWorktreeManager(root) });
  const pi = new PiAgentRunner();
  const hindsightClient = new HindsightClient({
    baseUrl: process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888",
    apiKey: process.env.HINDSIGHT_API_KEY,
  });
  await assertHindsightCompatibility(hindsightClient);
  const memory = new HindsightMemory(hindsightClient);
  const templatePath = process.env.HINDSIGHT_TEMPLATE_PATH ?? join(process.cwd(), "infra/hindsight/factory-bank-template.json");
  const template = validateHindsightTemplate(JSON.parse(await readFile(templatePath, "utf8")));
  await memory.bootstrapBank(memoryBankFromEnv(), template);
  const agent = createAgentActivities({
    run: pi.run.bind(pi),
    sessions: sessionLedger,
    memory: {
      async buildContext({ run, role, value, mentalModels, operations }) {
        const input = run as FactoryWorkflowInput;
        const context = { factoryRunId: input.runId, ticketId: input.taskId, attemptId: input.attemptId ?? "1", phaseId: role, agentRole: role, organization: input.organization, project: input.project, repository: input.repository };
        const tags = memoryTags(context);
        const bank = resolveProjectBank(input);
        return assembleAgentMemory(memory, { bank, role, query: JSON.stringify(value), mentalModels, tags, operations });
      },
      async retainOutcome({ run, role, output, operations }) {
        if (!operations.includes("retain")) return;
        const input = run as FactoryWorkflowInput;
        const context = { factoryRunId: input.runId, ticketId: input.taskId, attemptId: input.attemptId ?? "1", phaseId: role, agentRole: role, organization: input.organization, project: input.project, repository: input.repository };
        await memory.retain(resolveProjectBank(input), retainableAgentOutcome(role, output), context);
      },
    },
  });
  const image = process.env.FACTORY_IMAGE;
  if (!image) throw new Error("FACTORY_IMAGE is required");
  const build = createBuildActivities({
    runtime: crabbox,
    builder: createProductionArtifactBuilder({
      image,
      signingKey: process.env.FACTORY_PROVENANCE_SIGNING_KEY ?? "factory-dev-signing-key",
    }),
    configuredDigest: process.env.FACTORY_ARTIFACT_DIGEST,
  });
  const deploy = createDeployActivities({
    targets: { [process.env.FACTORY_DEPLOYMENT_PROFILE ?? "staging"]: deploymentTargetFromEnv() },
    ssh: new SshExecutor({ hosts: [process.env.FACTORY_DEPLOY_HOST ?? ""] }),
    health: new HealthChecker(),
  });
  const health = new HealthChecker();
  const projectionActivities = createProjectionActivities(projection);
  const hiddenScenariosRoot = process.env.FACTORY_HIDDEN_SCENARIOS_ROOT
    ?? join(process.cwd(), "factory/hidden-scenarios");
  const verifier = createVerifierActivities({ hiddenScenariosRoot });
  const metaFactoryActivities = createMetaFactoryActivities();
  const healthActivities = createHealthActivities({
    enqueueWorkOrder: async (input) => {
      await projection.recordEvent({
        runId: input.runId,
        eventId: `debt-work-order:${input.workOrder.id}`,
        type: "debt_work_order_enqueued",
        payload: input.workOrder,
      });
      return { enqueued: true, workOrderId: input.workOrder.id };
    },
  });
  const activities = instrumentActivities({
    ...repository,
    ...agent,
    ...build,
    ...deploy,
    ...projectionActivities,
    async securityScan(input: { worktree: { path: string } }) {
      const lease = await workspace.create({ path: input.worktree.path, network: "none" });
      try {
        const result = await workspace.exec(lease.id, "git", ["ls-files"], { cwd: "/workspace" });
        return result.exitCode === 0
          ? securityGate({ files: result.stdout.split("\\n").filter(Boolean) })
          : { passed: false, findings: [result.stderr] };
      } finally {
        await workspace.destroy(lease.id);
      }
    },
    async healthCheck(input: { url: string }) {
      try {
        await health.wait(input.url, { attempts: 3, intervalMs: 500 });
        return { healthy: true, url: input.url };
      } catch {
        return { healthy: false, url: input.url };
      }
    },
    async updateTaskStatus(input: { taskId: string; status: string; runId: string; currentNode?: string; failureReason?: string }) {
      await projection.recordRun({
        runId: input.runId,
        workflowId: `factory-${input.runId}`,
        taskId: input.taskId,
        status: input.status,
        currentNode: input.currentNode,
        failureReason: input.failureReason,
      });
    },
    runBehavioralVerification: verifier.runBehavioralVerification,
    ...healthActivities,
    ...metaFactoryActivities,
  });
  const workflowsPath = fileURLToPath(new URL("./workflows", import.meta.url));
  await Promise.all((await createProductionWorkers({ workflowsPath, activities })).map((worker) => worker.run()));
}
