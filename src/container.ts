import { readFile } from "node:fs/promises";
import { createApiServer } from "./api/server.js";
import type { ApiStore } from "./api/server.js";
import { createPool } from "./db/database.js";
import { PostgresApplicationStore } from "./db/application-store.js";
import { createAgentNode } from "./agents/agent-node.js";
import { PiAgentRunner } from "./agents/pi-agent.js";
import { mvpWorkflow } from "./workflow/mvp-workflow.js";
import type { WorkflowDefinition } from "./workflow/workflow.js";
import { FactoryScheduler, InMemorySchedulerStore, type ScheduledNode } from "./scheduler/scheduler.js";

interface RunRecord {
  id: string;
  title: string;
  description: string;
  repository: string;
  status: "running" | "cancelled";
  nodes: Array<{ id: string; name: string; status: "pending" | "leased" | "succeeded" | "failed"; input: unknown; output?: unknown }>;
}

export class InMemoryApplicationStore implements ApiStore {
  private nextRun = 1;
  private readonly runs = new Map<string, RunRecord>();
  private readonly events = new Map<string, unknown[]>();

  constructor(private readonly schedulerStore: InMemorySchedulerStore, private readonly workflow: WorkflowDefinition) {}

  async createTask(input: { repository: string; title: string; description: string }): Promise<string> {
    const id = `run-${this.nextRun++}`;
    const run: RunRecord = {
      id,
      title: input.title,
      description: input.description,
      repository: input.repository,
      status: "running",
      nodes: this.workflow.nodes.map((node, index) => ({
        id: `${id}-node-${index + 1}`,
        name: node.name,
        status: "pending",
        input: { repository: input.repository, description: input.description },
      })),
    };
    this.runs.set(id, run);
    this.events.set(id, [{ type: "run_created", runId: id }]);
    this.schedulerStore.add(run.nodes.map((node, index) => ({
      id: node.id,
      status: "pending",
      dependencies: index === 0 ? [] : [run.nodes[index - 1].id],
    })));
    return id;
  }

  async runNode(node: ScheduledNode): Promise<void> {
    const run = [...this.runs.values()].find((candidate) => candidate.nodes.some((item) => item.id === node.id));
    if (!run) throw new Error(`unknown run for node: ${node.id}`);
    const record = run.nodes.find((item) => item.id === node.id);
    if (!record) throw new Error(`unknown node: ${node.id}`);
    record.status = "leased";
    const workflowNode = this.workflow.nodes.find((item) => item.name === record.name);
    if (!workflowNode) throw new Error(`unknown workflow node: ${record.name}`);
    record.output = await workflowNode.run(record.input, {
      runId: run.id,
      ticketId: run.id,
      attemptId: "attempt-1",
      worktreePath: run.repository,
    });
    record.status = "succeeded";
  }

  async getRun(id: string): Promise<RunRecord | null> {
    return this.runs.get(id) ?? null;
  }

  async getEvents(id: string): Promise<unknown[]> {
    return this.events.get(id) ?? [];
  }

  async cancelRun(id: string): Promise<void> {
    const run = this.runs.get(id);
    if (run) run.status = "cancelled";
  }

  async retryNode(_id: string): Promise<void> {}
}

export interface Application {
  store: ApiStore;
  scheduler: FactoryScheduler;
  api: ReturnType<typeof createApiServer>;
}

export async function createApplication(options: {
  workspaceMode?: "test" | "production";
  arbitraryCode?: boolean;
  provider?: "process" | "sandbox";
} = {}): Promise<Application> {
  if (options.workspaceMode === "production" && options.arbitraryCode && options.provider === "process") {
    throw new Error("production sandbox provider is required for arbitrary-code execution");
  }

  const schedulerStore = new InMemorySchedulerStore([]);
  const agentRunner = new PiAgentRunner();
  const workflow: WorkflowDefinition = {
    ...mvpWorkflow,
    nodes: mvpWorkflow.nodes.map((node) => node.kind === "agent" ? createAgentNode(agentRunner, node.name) : node),
  };
  let store: ApiStore = new InMemoryApplicationStore(schedulerStore, workflow);
  if (options.workspaceMode !== "test" && process.env.DATABASE_URL) {
    const pool = createPool();
    await pool.query(await readFile(new URL("./db/schema.sql", import.meta.url), "utf8"));
    store = new PostgresApplicationStore(pool);
  }
  const scheduler = new FactoryScheduler(schedulerStore, async (node) => {
    if (store instanceof InMemoryApplicationStore) await store.runNode(node);
  }, 1);
  return { store, scheduler, api: createApiServer(store) };
}
