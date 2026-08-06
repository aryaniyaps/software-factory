import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createPool } from "../db/database.js";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import { HindsightMemory } from "../integrations/hindsight.js";
import { projectBankId, memoryTags } from "../integrations/hindsight-config.js";
import { buildMemoryContext } from "./activities/memory-context.js";
import { createFactoryProjection } from "../db/factory-projection.js";
import { PiAgentRunner } from "../agents/pi-agent.js";
import { CrabboxWorkspaceProvider } from "../workspaces/crabbox-provider.js";
import { officialCrabboxRuntime } from "../workspaces/crabbox-runtime.js";
import { assertCrabboxAvailable } from "../workspaces/crabbox-doctor.js";
import { GitWorktreeManager } from "../workspaces/worktree-manager.js";
import { SshExecutor } from "../deploy/ssh-executor.js";
import { HealthChecker } from "../deploy/health-checker.js";
import { createRepositoryActivities } from "./activities/repository.js";
import { createCrabboxActivityRuntime } from "./activities/crabbox.js";
import { createAgentActivities } from "./activities/agent.js";
import { createBuildActivities } from "./activities/build.js";
import { createDeployActivities, type DeploymentTarget } from "./activities/deploy.js";
import type { FactoryWorkflowInput } from "./client.js";
import { createProductionWorkers } from "./worker-main.js";

const execFile = promisify(nodeExecFile);

type Environment = Record<string, string | undefined>;

export function memoryBankFromEnv(env: Environment = process.env): string {
  if (!env.FACTORY_ORGANIZATION || !env.FACTORY_PROJECT) throw new Error("FACTORY_ORGANIZATION and FACTORY_PROJECT are required");
  return projectBankId(env.FACTORY_ORGANIZATION, env.FACTORY_PROJECT);
}

export function deploymentTargetFromEnv(env: Environment = process.env): DeploymentTarget {
  if (!env.FACTORY_DEPLOY_HOST || !env.FACTORY_HEALTH_URL) throw new Error("FACTORY_DEPLOY_HOST and FACTORY_HEALTH_URL are required");
  return { host: env.FACTORY_DEPLOY_HOST, healthUrl: env.FACTORY_HEALTH_URL, previousDigest: env.FACTORY_PREVIOUS_DIGEST };
}

async function prepareRepository(repository: string): Promise<{ repository: string; revision: string }> {
  const root = process.env.REPOSITORY_CACHE_ROOT ?? "/tmp/software-factory-repositories";
  let path = repository;
  if (repository.startsWith("https://")) {
    await mkdir(root, { recursive: true });
    path = join(root, repository.split("/").pop()?.replace(/\.git$/, "") || "repository");
    try {
      await execFile("git", ["-C", path, "fetch", "--prune"]);
    } catch {
      await execFile("git", ["clone", "--depth", "1", repository, path]);
    }
  }
  const { stdout } = await execFile("git", ["-C", path, "rev-parse", "HEAD"]);
  return { repository: path, revision: stdout.trim() };
}

export async function startWorkers(): Promise<void> {
  await assertCrabboxAvailable();
  const root = process.env.WORKTREE_ROOT ?? "/tmp/software-factory-worktrees";
  const workspace = new CrabboxWorkspaceProvider(officialCrabboxRuntime);
  const crabbox = createCrabboxActivityRuntime(workspace);
  const repository = createRepositoryActivities({ git: { prepare: prepareRepository }, worktrees: new GitWorktreeManager(root) });
  const pi = new PiAgentRunner();
  const hindsightClient = new HindsightClient({ baseUrl: process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888", apiKey: process.env.HINDSIGHT_API_KEY });
  const memory = new HindsightMemory(hindsightClient as unknown as ConstructorParameters<typeof HindsightMemory>[0]);
  const templatePath = process.env.HINDSIGHT_TEMPLATE_PATH ?? join(process.cwd(), "infra/hindsight/factory-bank-template.json");
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  await memory.bootstrapBank(memoryBankFromEnv(), template);
  const agent = createAgentActivities({
    run: pi.run.bind(pi),
    memory: {
      async buildContext({ run, role, value, mentalModels }) {
        const input = run as FactoryWorkflowInput;
        const context = { factoryRunId: input.runId, ticketId: input.taskId, attemptId: input.attemptId ?? "1", phaseId: role, agentRole: role, organization: input.organization, project: input.project, repository: input.repository };
        const tags = memoryTags(context);
        const bank = projectBankId(input.organization ?? "default", input.project ?? input.repository);
        return buildMemoryContext({
          recallProject: (request) => memory.recallProject(request),
          reflectProject: (request) => memory.reflectProject(request),
          getMentalModel: (bankId, modelId, options) => memory.getMentalModelForProject(bankId, modelId, options.tags),
        }, { bank, role, query: JSON.stringify(value), mentalModels, tags });
      },
      async retainOutcome({ run, role, output }) {
        const input = run as FactoryWorkflowInput;
        await memory.retain(projectBankId(input.organization ?? "default", input.project ?? input.repository), output, { factoryRunId: input.runId, ticketId: input.taskId, attemptId: input.attemptId ?? "1", phaseId: role, agentRole: role, organization: input.organization, project: input.project, repository: input.repository });
      },
    },
  });
  const build = createBuildActivities({
    runtime: crabbox,
    builder: {
      async build(vm, input) {
        const image = process.env.FACTORY_IMAGE;
        const digest = process.env.FACTORY_ARTIFACT_DIGEST;
        if (!image || !digest) throw new Error("FACTORY_IMAGE and FACTORY_ARTIFACT_DIGEST are required");
        const result = await vm.exec("buildctl-daemonless.sh", ["build", "--frontend", "dockerfile.v0", "--local", "context=/work/crabbox", "--local", "dockerfile=/work/crabbox", "--output", `type=image,name=${image},push=true`], { timeoutMs: 60 * 60_000 });
        if (result.exitCode !== 0) throw new Error(`isolated build failed: ${result.stderr}`);
        return { image, digest };
      },
    },
  });
  const deploy = createDeployActivities({
    targets: { [process.env.FACTORY_DEPLOYMENT_PROFILE ?? "staging"]: deploymentTargetFromEnv() },
    ssh: new SshExecutor({ hosts: [process.env.FACTORY_DEPLOY_HOST ?? ""] }),
    health: new HealthChecker(),
  });
  const pool = createPool();
  const projection = createFactoryProjection(pool);
  const activities = {
    ...repository,
    ...agent,
    ...build,
    ...deploy,
    async updateTaskStatus(input: { taskId: string; status: string; runId: string }) {
      await projection.recordRun({ runId: input.runId, workflowId: `factory-${input.runId}`, taskId: input.taskId, status: input.status });
    },
  };
  const workflowsPath = fileURLToPath(new URL("./workflows", import.meta.url));
  await Promise.all((await createProductionWorkers({ workflowsPath, activities })).map((worker) => worker.run()));
}
