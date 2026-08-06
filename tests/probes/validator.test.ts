import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadProbeBankFromRoot } from "../../src/probes/bank.js";
import {
  validateProbe,
  validateProbeDefinition,
  type ProbeValidationContext,
} from "../../src/probes/validator.js";
import type { ProbeDefinition } from "../../src/probes/types.js";

const validProbe: ProbeDefinition = {
  schemaVersion: "probe.v1",
  id: "PRB-VALID",
  title: "Valid probe",
  requirement: "Add a retry-safe webhook sender without changing public API signatures.",
  difficulty: 5,
  acceptance: ["AC-PROBE-VALID"],
  adapter: { command: "test", args: ["-f", "provider.marker"] },
  repeats: 2,
  maxVariance: 0.05,
  startingMarkers: {
    baseline: ["webhook.sender"],
    candidate: ["webhook.sender"],
  },
};

async function createRevisionRoots(): Promise<{ baselineRoot: string; candidateRoot: string }> {
  const baselineRoot = await mkdtemp(join(tmpdir(), "sf-probe-base-"));
  const candidateRoot = await mkdtemp(join(tmpdir(), "sf-probe-cand-"));
  await writeFile(join(baselineRoot, "webhook.sender"), "ok\n");
  await writeFile(join(candidateRoot, "webhook.sender"), "ok\n");
  await writeFile(join(candidateRoot, "feature.marker"), "enabled\n");
  return { baselineRoot, candidateRoot };
}

async function markerExists(root: string, marker: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(join(root, marker));
    return true;
  } catch {
    return false;
  }
}

function validationContext(
  baselineRoot: string,
  candidateRoot: string,
  candidateDiffSummary = "candidate adds feature.marker",
): ProbeValidationContext {
  return {
    baselineRoot,
    candidateRoot,
    candidateDiffSummary,
    hiddenTest: async (root, probe) => {
      const marker = probe.adapter.args?.[1] ?? "";
      const exists = await markerExists(root, marker);
      return { exitCode: exists ? 0 : 1, stdout: "", stderr: "" };
    },
  };
}

describe("probe validator", () => {
  it("rejects invalid probe definitions", () => {
    expect(() => validateProbeDefinition({ id: "bad" })).toThrow(/invalid probe contract/i);
  });

  it("flags leaked probes that reference candidate-only implementation details", async () => {
    const { baselineRoot, candidateRoot } = await createRevisionRoots();
    const root = new URL("./fixtures/hidden-probes", import.meta.url).pathname;
    const bank = await loadProbeBankFromRoot(root, { hiddenRoot: root, role: "probe_verifier" });
    const leaked = bank.probes.find((probe) => probe.id === "PRB-LEAKED");
    expect(leaked).toBeDefined();

    const result = await validateProbe(leaked!, validationContext(
      baselineRoot,
      candidateRoot,
      "introduces CandidateSecretService in src/internal/candidate-secret.ts",
    ));
    expect(result.status).toBe("leaked");
    expect(result.mergeable).toBe(false);
  });

  it("flags already-implemented probes when hidden tests pass without agent work", async () => {
    const baselineRoot = await mkdtemp(join(tmpdir(), "sf-probe-base-"));
    const candidateRoot = await mkdtemp(join(tmpdir(), "sf-probe-cand-"));
    await writeFile(join(baselineRoot, "feature.marker"), "ok\n");
    await writeFile(join(candidateRoot, "feature.marker"), "ok\n");

    const root = new URL("./fixtures/hidden-probes", import.meta.url).pathname;
    const bank = await loadProbeBankFromRoot(root, { hiddenRoot: root, role: "probe_verifier" });
    const alreadyDone = bank.probes.find((probe) => probe.id === "PRB-ALREADY-DONE");
    expect(alreadyDone).toBeDefined();

    const result = await validateProbe(alreadyDone!, validationContext(baselineRoot, candidateRoot));
    expect(result.status).toBe("already_implemented");
    expect(result.mergeable).toBe(false);
  });

  it("flags unequal-difficulty probes when starting markers differ", async () => {
    const baselineRoot = await mkdtemp(join(tmpdir(), "sf-probe-base-"));
    const candidateRoot = await mkdtemp(join(tmpdir(), "sf-probe-cand-"));
    await writeFile(join(baselineRoot, "transport.core"), "ok\n");
    await writeFile(join(candidateRoot, "transport.core"), "ok\n");
    await writeFile(join(candidateRoot, "transport.shim"), "partial\n");

    const root = new URL("./fixtures/hidden-probes", import.meta.url).pathname;
    const bank = await loadProbeBankFromRoot(root, { hiddenRoot: root, role: "probe_verifier" });
    const unequal = bank.probes.find((probe) => probe.id === "PRB-UNEQUAL");
    expect(unequal).toBeDefined();

    const result = await validateProbe(unequal!, validationContext(baselineRoot, candidateRoot));
    expect(result.status).toBe("unequal_difficulty");
    expect(result.mergeable).toBe(false);
  });

  it("accepts realistic, independent, testable probes with equal starting difficulty", async () => {
    const { baselineRoot, candidateRoot } = await createRevisionRoots();
    await writeFile(join(baselineRoot, "checkout.port"), "ok\n");
    await writeFile(join(candidateRoot, "checkout.port"), "ok\n");

    const result = await validateProbe(validProbe, validationContext(baselineRoot, candidateRoot));
    expect(result.status).toBe("valid");
    expect(result.mergeable).toBe(false);
  });
});
