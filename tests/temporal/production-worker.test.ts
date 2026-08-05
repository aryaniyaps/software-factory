import { describe, expect, it } from "vitest";
import { deploymentTargetFromEnv, memoryBankFromEnv } from "../../src/temporal/production-worker.js";

describe("production worker configuration", () => {
  it("derives the organization/project Hindsight bank", () => {
    expect(memoryBankFromEnv({ FACTORY_ORGANIZATION: "Acme", FACTORY_PROJECT: "Platform" })).toBe("acme-platform");
  });

  it("requires explicit immutable deployment configuration", () => {
    expect(deploymentTargetFromEnv({ FACTORY_DEPLOY_HOST: "staging", FACTORY_HEALTH_URL: "https://staging/health", FACTORY_PREVIOUS_DIGEST: `registry/app@sha256:${"b".repeat(64)}` })).toEqual({ host: "staging", healthUrl: "https://staging/health", previousDigest: `registry/app@sha256:${"b".repeat(64)}` });
  });
});
