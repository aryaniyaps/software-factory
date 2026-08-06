import { describe, expect, it } from "vitest";
import { createProductionActivities } from "../../src/temporal/activities/production.js";

describe("production activities", () => {
  it("runs agent and checks through injected execution adapters", async () => {
    const calls: string[] = [];
    const activities = createProductionActivities({
      prepareRepository: async () => ({ repository: "org/app", revision: "abc" }),
      createWorktree: async () => ({ path: "/worktree", branch: "factory/run" }),
      agentRunner: { run: async () => { calls.push("agent"); return { sessionId: "session", text: JSON.stringify({ schemaVersion: "agent-output.v1", role: "implement", status: "succeeded", summary: "done", evidenceRefs: ["ev-1"], data: {} }) }; } },
      workspace: {
        create: async () => ({ id: "vm" }),
        exec: async (_id, command) => { calls.push(command); return { exitCode: 0, stdout: "src/index.ts\n", stderr: "" }; },
        destroy: async () => {},
      },
      health: { wait: async () => { calls.push("health"); } },
      buildArtifact: async () => ({ image: "app", digest: "app@sha256:abc" }),
      deploy: async () => { calls.push("deploy"); return { deployed: true, healthUrl: "http://app" }; },
      updateTaskStatus: async () => {},
    });
    const input = { runId: "run", taskId: "task", repository: "org/app", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" };
    const worktree = await activities.createWorktree({ ...input, preparation: { repository: "org/app", revision: "abc" } });
    await activities.runAgent({ run: input, worktree, role: "implement", input: {} });
    expect(await activities.securityScan({ run: input, worktree })).toEqual({ passed: true, findings: [] });
    await activities.runChecks({ run: input, worktree });
    await activities.deploy({ run: input, artifact: { image: "app", digest: "app@sha256:abc" } });
    await activities.healthCheck({ run: input, url: "http://app", digest: "app@sha256:abc" });
    expect(calls).toEqual(["agent", "git", "npm", "deploy", "health"]);
  });
});
