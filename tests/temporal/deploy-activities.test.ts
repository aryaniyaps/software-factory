import { describe, expect, it } from "vitest";
import { createDeployActivities } from "../../src/temporal/activities/deploy.js";

describe("deploy activities", () => {
  it("rolls back to the previous digest after an unhealthy health check", async () => {
    const commands: string[][] = [];
    let healthChecks = 0;
    const activities = createDeployActivities({
      targets: { staging: { host: "staging", healthUrl: "http://staging/health", previousDigest: `registry/app@sha256:${"b".repeat(64)}` } },
      ssh: { run: async (_host, args) => { commands.push(args); return { exitCode: 0, stdout: "", stderr: "" }; } },
      health: { wait: async () => { healthChecks++; if (healthChecks === 1) throw new Error("unhealthy"); } },
    });
    const run = { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" };
    const artifact = { image: "registry/app", digest: `registry/app@sha256:${"a".repeat(64)}` };
    await expect(activities.deploy({ run, artifact })).resolves.toEqual({ deployed: true, healthUrl: "http://staging/health" });
    await expect(activities.healthCheck({ run, url: "http://staging/health", digest: artifact.digest })).resolves.toEqual({ healthy: false, url: "http://staging/health" });
    expect(commands).toContainEqual(["docker", "run", "-d", "--name", "factory-app", `registry/app@sha256:${"b".repeat(64)}`]);
  });

  it("rejects mutable artifacts before SSH", async () => {
    let called = false;
    const activities = createDeployActivities({
      targets: { staging: { host: "staging", healthUrl: "http://staging/health" } },
      ssh: { run: async () => { called = true; return { exitCode: 0, stdout: "", stderr: "" }; } },
      health: { wait: async () => {} },
    });
    await expect(activities.deploy({ run: { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" }, artifact: { image: "registry/app:latest", digest: "registry/app:latest" } })).rejects.toThrow("immutable image digest");
    expect(called).toBe(false);
  });

  it("rolls back the exact previous digest when semantic observation fails", async () => {
    const commands: string[][] = [];
    const candidateDigest = `registry/app@sha256:${"a".repeat(64)}`;
    const previousDigest = `registry/app@sha256:${"b".repeat(64)}`;
    const activities = createDeployActivities({
      targets: { staging: { host: "staging", healthUrl: "http://staging/health", previousDigest } },
      ssh: { run: async (_host, args) => { commands.push(args); return { exitCode: 0, stdout: "", stderr: "" }; } },
      health: { wait: async () => {} },
      productSignals: {
        collect: async () => ({ productChecksPassed: false, sloBreaches: ["checkout-success-rate"] }),
      },
    });
    const run = { runId: "run", taskId: "task", repository: "/repo", baseBranch: "main", workflow: "feature", deploymentProfile: "staging", sandboxProfile: "crabbox" };
    await activities.deployCanary({ run, artifact: { image: "registry/app", digest: candidateDigest }, deploymentId: "dep-1", percentage: 100, stageIndex: 0 });
    const signals = await activities.observeDeployment({ run, deploymentId: "dep-1", digest: candidateDigest, healthUrl: "http://staging/health" });
    expect(signals.semantic.productChecksPassed).toBe(false);
    const rollback = await activities.rollbackDeployment({
      run,
      deploymentId: "dep-1",
      candidateDigest,
      targetDigest: previousDigest,
      idempotencyKey: `rollback:dep-1:${candidateDigest}->${previousDigest}`,
      healthUrl: "http://staging/health",
    });
    expect(rollback.digest).toBe(previousDigest);
    expect(commands).toContainEqual(["docker", "run", "-d", "--name", "factory-app", previousDigest]);
  });
});
