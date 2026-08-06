import { createHash } from "node:crypto";
import { stableSerialize } from "../contracts/evidence.js";

export interface SbomComponent {
  name: string;
  version: string;
  type: "npm";
}

export interface SbomDocument {
  schemaVersion: "sbom.v1";
  components: SbomComponent[];
}

interface PackageLock {
  packages?: Record<string, { version?: string }>;
}

export function generateSbomFromPackageLock(lockfile: unknown): SbomDocument {
  const parsed = lockfile as PackageLock;
  const components = Object.entries(parsed.packages ?? {})
    .filter(([name]) => name.startsWith("node_modules/"))
    .map(([name, entry]) => ({
      name: name.replace(/^node_modules\//, ""),
      version: entry.version ?? "unknown",
      type: "npm" as const,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { schemaVersion: "sbom.v1", components };
}

export function hashSbom(sbom: SbomDocument): string {
  return createHash("sha256").update(stableSerialize(sbom)).digest("hex");
}
