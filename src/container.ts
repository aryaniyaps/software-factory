import { createApiServer } from "./api/server.js";
import type { ApiStore } from "./api/server.js";
import { mvpWorkflow } from "./workflow/mvp-workflow.js";
import { FactoryScheduler, InMemorySchedulerStore } from "./scheduler/scheduler.js";

interface RunRecord {
  id: string;
  title: string;
  description: string;
  repository: string;
  status: "running" | "cancelled";
  nodes: Array<{ id: string; name: string; status: "pending" }>;
}

export class InMemoryApplicationStore implements ApiStore {
  private nextRun = 1;
  private readonly runs = new Map<string, RunRecord>();
  private readonly events = new Map<string, unknown[]>();

  async createTask(input: { repository: string; title: string; description: string }): Promise<string> {
    const id = `run-${this.nextRun++}`;
    const run: RunRecord = {
      id,
      title: input.title,
      description: input.description,
      repository: input.repository,
      status: "running",
      nodes: mvpWorkflow.nodes.map((node, index) => ({ id: `${id}-node-${index + 1}`, name: node.name, status: "pending" })),
    };
    this.runs.set(id, run);
    this.events.set(id, [{ type: "run_created", runId: id }]);
    return id;
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
  store: InMemoryApplicationStore;
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
  const store = new InMemoryApplicationStore();
  const schedulerStore = new InMemorySchedulerStore([]);
  const scheduler = new FactoryScheduler(schedulerStore, async () => {}, 1);
  return { store, scheduler, api: createApiServer(store) };
}
