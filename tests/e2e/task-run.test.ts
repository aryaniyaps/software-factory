import { describe, expect, it } from "vitest";
import { createApplication } from "../../src/container.js";

describe("task lifecycle", () => {
  it("creates a persisted run and exposes its graph status", async () => {
    const app = await createApplication({ workspaceMode: "test" });
    const id = await app.store.createTask({ repository: "/repo", title: "Health", description: "Add health" });
    const run = await app.store.getRun(id) as { id: string; title: string; status: string; nodes: unknown[] };
    expect(run).toMatchObject({ id, title: "Health", status: "running" });
    expect(run.nodes.length).toBeGreaterThan(5);
  });

  it("rejects the process provider for arbitrary-code mode", async () => {
    await expect(createApplication({ workspaceMode: "production", arbitraryCode: true, provider: "process" })).rejects.toThrow("production sandbox provider");
  });
});
