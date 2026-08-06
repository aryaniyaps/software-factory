import { describe, expect, it } from "vitest";
import {
  assertVerifierCredentialIsolation,
  resolveCapabilityPolicy,
  workspaceSpecForRole,
} from "../../src/security/capability-policy.js";

describe("capability policy", () => {
  it("defaults sandbox network to none for implementer and verifier roles", () => {
    expect(resolveCapabilityPolicy("implementer").network).toBe("none");
    expect(resolveCapabilityPolicy("verifier").network).toBe("none");
    expect(resolveCapabilityPolicy("security_scan").network).toBe("none");
  });

  it("grants restricted network only to the builder role", () => {
    expect(resolveCapabilityPolicy("builder").network).toBe("restricted");
  });

  it("uses distinct credential profiles for implementer and verifier", () => {
    const implementer = resolveCapabilityPolicy("implementer");
    const verifier = resolveCapabilityPolicy("verifier");
    expect(implementer.credentialProfile).not.toBe(verifier.credentialProfile);
    expect(() => assertVerifierCredentialIsolation(implementer.credentialProfile, verifier.credentialProfile)).not.toThrow();
  });

  it("rejects verifier credentials that match implementer credentials", () => {
    expect(() => assertVerifierCredentialIsolation("implementer", "implementer")).toThrow("verifier credentials must differ");
  });

  it("builds workspace specs from role allowlists", () => {
    expect(workspaceSpecForRole("/worktree", "implementer")).toMatchObject({
      path: "/worktree",
      network: "none",
      privileged: false,
      role: "implementer",
    });
    expect(workspaceSpecForRole("/worktree", "builder")).toMatchObject({ network: "restricted", role: "builder" });
  });
});
