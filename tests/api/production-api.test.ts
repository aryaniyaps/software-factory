import { describe, expect, it } from "vitest";
import { createProductionApi } from "../../src/api/production-api.js";

const input = { repository: "https://github.com/acme/app.git", title: "Fix", description: "Do it" };
const store = () => ({
  async createTask() { return "task-1"; },
  async getRun() { return null; },
  async cancelRun() {},
});

describe("production API", () => {
  it("starts one Temporal workflow after persisting a task", async () => {
    const starts: Array<{ workflowId: string; args: unknown[] }> = [];
    const api = createProductionApi({
      store: store(),
      workflowClient: {
        workflow: {
          async start(_workflow, options) {
            starts.push({ workflowId: options.workflowId, args: options.args });
            return {};
          },
        },
      },
    });

    await api.createTask(input);

    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ workflowId: "factory-task-1" });
  });

  it("signals Temporal when a run is cancelled without mutating projection state", async () => {
    let signal = "";
    let storeCancelled = false;
    const api = createProductionApi({
      store: {
        ...store(),
        async cancelRun() { storeCancelled = true; },
      },
      workflowClient: {
        workflow: {
          async start() { return {}; },
          getHandle() { return { async signal(name: string) { signal = name; } }; },
        },
      },
    });

    await api.cancelRun("task-1");

    expect(signal).toBe("cancelFactory");
    expect(storeCancelled).toBe(false);
  });

  it("uses the same workflow ID for the same task", async () => {
    const ids: string[] = [];
    const api = createProductionApi({
      store: store(),
      workflowClient: {
        workflow: {
          async start(_workflow, options) { ids.push(options.workflowId); return {}; },
        },
      },
    });

    await api.createTask(input);
    await api.createTask(input);

    expect(ids).toEqual(["factory-task-1", "factory-task-1"]);
  });
});
