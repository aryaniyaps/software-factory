import { describe, expect, it } from "vitest";
import { createFactoryProjection } from "../../src/db/factory-projection.js";

describe("FactoryProjection", () => {
  it("uses idempotent parameterized writes for runs, events, artifacts, and deployments", async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const projection = createFactoryProjection({ query: async (text, values = []) => { queries.push({ text, values }); return { rows: [] }; } });
    await projection.recordRun({ runId: "run", workflowId: "factory-run", taskId: "task", status: "running" });
    await projection.recordEvent({ runId: "run", eventId: "event-1", type: "started", payload: { node: "scout" } });
    await projection.recordArtifact({ runId: "run", digest: `registry/app@sha256:${"a".repeat(64)}`, image: "registry/app" });
    await projection.recordDeployment({ runId: "run", profile: "staging", digest: `registry/app@sha256:${"a".repeat(64)}`, status: "healthy" });
    expect(queries).toHaveLength(4);
    expect(queries.every(({ text }) => text.includes("ON CONFLICT"))).toBe(true);
    expect(queries[1].values).toContain("event-1");
  });
});
