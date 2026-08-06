import type { WorkspaceSpec } from "../workspaces/provider.js";

export const FACTORY_SANDBOX_ROLES = ["implementer", "verifier", "builder", "security_scan"] as const;
export type FactorySandboxRole = (typeof FACTORY_SANDBOX_ROLES)[number];

export interface CapabilityPolicy {
  network: "none" | "restricted";
  filesystem: "read-write" | "read-only";
  credentialProfile: string;
}

const ROLE_CAPABILITIES: Record<FactorySandboxRole, CapabilityPolicy> = {
  implementer: { network: "none", filesystem: "read-write", credentialProfile: "implementer" },
  verifier: { network: "none", filesystem: "read-only", credentialProfile: "verifier" },
  builder: { network: "restricted", filesystem: "read-write", credentialProfile: "builder" },
  security_scan: { network: "none", filesystem: "read-only", credentialProfile: "verifier" },
};

export function resolveCapabilityPolicy(role: FactorySandboxRole): CapabilityPolicy {
  return ROLE_CAPABILITIES[role];
}

export function assertVerifierCredentialIsolation(implementerProfile: string, verifierProfile: string): void {
  if (implementerProfile === verifierProfile) {
    throw new Error("verifier credentials must differ from implementer credentials");
  }
}

export function workspaceSpecForRole(path: string, role: FactorySandboxRole): WorkspaceSpec {
  const policy = resolveCapabilityPolicy(role);
  return { path, network: policy.network, privileged: false, role };
}

export function assertWorkspaceMatchesPolicy(spec: WorkspaceSpec): void {
  if (spec.privileged) throw new Error("privileged workspaces are not allowed");
  const role = spec.role ?? "implementer";
  const policy = resolveCapabilityPolicy(role);
  const network = spec.network ?? policy.network;
  if (network !== policy.network) {
    throw new Error(`network ${network} is not allowed for role ${role}`);
  }
  if (role === "implementer" || role === "verifier" || role === "security_scan") {
    assertVerifierCredentialIsolation(
      resolveCapabilityPolicy("implementer").credentialProfile,
      resolveCapabilityPolicy("verifier").credentialProfile,
    );
  }
}
