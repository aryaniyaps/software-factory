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
import { assembleAgentMemory, memoryQueryFromAgentValue, retainableAgentOutcome } from "../agents/memory.js";
import { createFilesystemObjectStore } from "../evidence/object-store.js";
import { createAgentExecutionRecorder } from "../evidence/agent-execution-recorder.js";
import { PiAgentRunner } from "../agents/pi-agent.js";
import { CrabboxWorkspaceProvider } from "../workspaces/crabbox-provider.js";
import { createCrabboxRuntime, officialCrabboxCommandRunner } from "../workspaces/crabbox-runtime.js";
import { assertCrabboxAvailable } from "../workspaces/crabbox-doctor.js";
import { GitWorktreeManager } from "../workspaces/worktree-manager.js";
import { SshExecutor } from "../deploy/ssh-executor.js";
import { HealthChecker } from "../deploy/health-checker.js";
import { securityGate } from "../gates/security-gate.js";
import { createRepositoryActivities } from "./activities/repository.js";
import { createCrabboxActivityRuntime } from "./activities/crabbox.js";
import { createAgentActivities } from "./activities/agent.js";
import { createProductionArtifactBuilder } from "../security/production-builder.js";
import { createBuildActivities } from "./activities/build.js";
import { createDeployActivities, createLocalDeployActivities, type DeploymentTarget } from "./activities/deploy.js";
import type { FactoryWorkflowInput } from "./client.js";
import { createProductionWorkers } from "./worker-main.js";
import { instrumentActivities } from "../telemetry/bootstrap.js";
import { createVerifierActivities } from "./activities/verifier-impl.js";
import { createHealthActivities } from "./activities/health.js";
import { createMetaFactoryActivities } from "./activities/meta-factory.js";
import { createGitHubInstallationStore } from "../db/github-installation-store.js";
import { createGitHubAppService, loadGitHubAppConfig, repositoryFullNameFromCloneUrl } from "../integrations/github-app.js";
import type { GitHubAppService } from "../integrations/github-app.js";
import { startActivityHeartbeat } from "./activities/activity-heartbeat.js";

const execFile = promisify(nodeExecFile);

type Environment = Record<string, string | undefined>;

export { memoryBankFromEnv } from "../integrations/hindsight-config.js";

export function deploymentTargetFromEnv(env: Environment = process.env): DeploymentTarget {
  if (!env.FACTORY_DEPLOY_HOST || !env.FACTORY_HEALTH_URL) throw new Error("FACTORY_DEPLOY_HOST and FACTORY_HEALTH_URL are required");
  return { host: env.FACTORY_DEPLOY_HOST, healthUrl: env.FACTORY_HEALTH_URL, previousDigest: env.FACTORY_PREVIOUS_DIGEST };
}

export function authenticatedGitHubCloneUrl(repository: string, token: string): string {
  const url = new URL(repository.endsWith(".git") ? repository : `${repository}.git`);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

function normalizeGitRemoteUrl(url: string): string {
  try {
    const parsed = new URL(url.endsWith(".git") ? url : `${url}.git`);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function sanitizeGitCommandError(error: unknown, token?: string): Error {
  if (!(error instanceof Error)) return new Error(String(error));
  let message = error.message;
  if (token) message = message.replaceAll(token, "[redacted]");
  message = message.replace(/x-access-token:[^@\s]+@/g, "x-access-token:[redacted]@");
  return new Error(message);
}

async function prepareRepository(
  repository: string,
  github?: GitHubAppService,
): Promise<{ repository: string; revision: string }> {
  const root = process.env.REPOSITORY_CACHE_ROOT ?? "/tmp/software-factory-repositories";
  let path = repository;
  if (repository.startsWith("https://")) {
    await mkdir(root, { recursive: true });
    const name = repository.split("/").pop()?.replace(/\.git$/, "") || "repository";
    const key = createHash("sha256").update(repository).digest("hex").slice(0, 16);
    path = join(root, `${name}-${key}`);
    const fullName = repositoryFullNameFromCloneUrl(repository);
    const token = fullName && github ? await github.installationTokenForRepo(fullName) : undefined;
    if (fullName && github && !token) {
      throw new Error(`repository is not accessible via the connected GitHub App: ${fullName}`);
    }
    const remoteUrl = token ? authenticatedGitHubCloneUrl(repository, token) : repository;
    try {
      const { stdout: origin } = await execFile("git", ["-C", path, "remote", "get-url", "origin"], {
        timeout: 10_000,
      });
      if (normalizeGitRemoteUrl(origin.trim()) !== normalizeGitRemoteUrl(repository)) {
        throw new Error("repository cache origin mismatch");
      }
      await execFile("git", ["-C", path, "remote", "set-url", "origin", remoteUrl], { timeout: 10_000 });
      await execFile("git", ["-C", path, "fetch", "--prune"], { timeout: 120_000 });
      await execFile("git", ["-C", path, "remote", "set-url", "origin", repository], { timeout: 10_000 });
    } catch (error) {
      if (error instanceof Error && error.message === "repository cache origin mismatch") throw error;
      try {
        await execFile("git", ["clone", "--depth", "1", remoteUrl, path], { timeout: 120_000 });
        await execFile("git", ["-C", path, "remote", "set-url", "origin", repository], { timeout: 10_000 });
      } catch (cloneError) {
        throw sanitizeGitCommandError(cloneError, token);
      }
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
  const githubConfig = await loadGitHubAppConfig();
  const githubInstallations = createGitHubInstallationStore(db);
  const github = githubConfig ? createGitHubAppService(githubConfig, githubInstallations) : undefined;
  if (github) await github.bootstrapFromEnv();
  const sessionLedger = createAgentExecutionRecorder(
    createFilesystemObjectStore(
      process.env.EVIDENCE_OBJECT_STORE_ROOT ?? "/tmp/software-factory-evidence",
    ),
  );
  const root = process.env.WORKTREE_ROOT ?? "/tmp/software-factory-worktrees";
  const workspace = new CrabboxWorkspaceProvider(createCrabboxRuntime(officialCrabboxCommandRunner, {
    localContainerImage: process.env.CRABBOX_LOCAL_CONTAINER_IMAGE,
  }));
  const crabbox = createCrabboxActivityRuntime(workspace);
  const repository = createRepositoryActivities({
    git: { prepare: (target) => prepareRepository(target, github) },
    worktrees: new GitWorktreeManager(root),
  });
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
        return assembleAgentMemory(memory, {
          bank,
          role,
          query: memoryQueryFromAgentValue(role, value),
          mentalModels,
          tags,
          operations,
        });
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
    hostExec: async (command, args, options) => {
      try {
        const result = await execFile(command, args, {
          cwd: options.cwd,
          timeout: options.timeoutMs,
          maxBuffer: options.maxOutputBytes ?? 4 * 1024 * 1024,
        });
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
        return {
          exitCode: typeof execError.code === "number" ? execError.code : 1,
          stdout: execError.stdout ?? "",
          stderr: execError.stderr ?? (execError.message ?? String(error)),
        };
      }
    },
    builder: createProductionArtifactBuilder({
      image,
      signingKey: process.env.FACTORY_PROVENANCE_SIGNING_KEY ?? "factory-dev-signing-key",
    }),
    configuredDigest: process.env.FACTORY_ARTIFACT_DIGEST,
    image,
  });
  const deploy = !process.env.FACTORY_PREVIOUS_DIGEST
    ? createLocalDeployActivities({ healthUrl: process.env.FACTORY_HEALTH_URL ?? "http://127.0.0.1:9999/health" })
    : createDeployActivities({
      targets: { [process.env.FACTORY_DEPLOYMENT_PROFILE ?? "staging"]: deploymentTargetFromEnv() },
      ssh: new SshExecutor({ hosts: [process.env.FACTORY_DEPLOY_HOST ?? ""] }),
      health: new HealthChecker(),
    });
  const health = new HealthChecker();
  const hiddenScenariosRoot = process.env.FACTORY_HIDDEN_SCENARIOS_ROOT
    ?? join(process.cwd(), "factory/hidden-scenarios");
  const verifier = createVerifierActivities({ hiddenScenariosRoot });
  const metaFactoryActivities = createMetaFactoryActivities();
  const healthActivities = createHealthActivities({
    enqueueWorkOrder: async (input) => {
      return { enqueued: true, workOrderId: input.workOrder.id };
    },
  });
  const activities = instrumentActivities({
    ...repository,
    ...agent,
    ...build,
    ...deploy,
    async securityScan(input: { worktree: { path: string } }) {
      const stopHeartbeat = startActivityHeartbeat();
      try {
        const result = await execFile("git", ["-C", input.worktree.path, "ls-files"], { timeout: 120_000 });
        return result.stdout
          ? securityGate({ files: result.stdout.split("\n").filter(Boolean) })
          : { passed: true, findings: [] };
      } finally {
        stopHeartbeat();
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
    runBehavioralVerification: verifier.runBehavioralVerification,
    ...healthActivities,
    ...metaFactoryActivities,
  });
  const workflowsPath = fileURLToPath(new URL("./workflows", import.meta.url));
  await Promise.all((await createProductionWorkers({ workflowsPath, activities })).map((worker) => worker.run()));
}
