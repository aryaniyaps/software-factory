import { describe, expect, it } from "vitest";
import { createDeployActivities } from "../../src/temporal/activities/deploy.js";

describe("deploy activities", () => {
  it("rolls back to the previous digest after an unhealthy deployment", async () => {
    const commands: string[][] = [];
    let healthChecks = 0;
    const activities = createDeployActivities({
      targets: { staging: { host: "staging", healthUrl: "http://staging/health", previousDigest: `registry/app@sha256:${"b".repeat(64)}` } },
      ssh: { run: async (_host, args) => { commands.push(args); return { exitCode: 0, stdout: "", stderr: "" }; } },
      health: { wait: async () => { healthChecks++; if (healthChecks === 1) throw new Error("unhealthy"); } },
    });
    const result = await activities.deploy({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "gondolin" }, artifact: { image: "registry/app", digest: `registry/app@sha256:${"a".repeat(64)}` } });
    expect(result).toEqual({ deployed: false, healthUrl: "http://staging/health" });
    expect(commands).toContainEqual(["docker", "run", "-d", "--name", "factory-app", `registry/app@sha256:${"b".repeat(64)}`]);
  });

  it("rejects mutable artifacts before SSH", async () => {
    let called = false;
    const activities = createDeployActivities({
      targets: { staging: { host: "staging", healthUrl: "http://staging/health" } },
      ssh: { run: async () => { called = true; return { exitCode: 0, stdout: "", stderr: "" }; } },
      health: { wait: async () => {} },
    });
    await expect(activities.deploy({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "gondolin" }, artifact: { image: "registry/app:latest", digest: "registry/app:latest" } })).rejects.toThrow("immutable image digest");
    expect(called).toBe(false);
  });
});
