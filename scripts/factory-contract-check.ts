#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCoverage } from "../src/product-graph/coverage.js";
import { loadProductGraph } from "../src/product-graph/loader.js";
import { validateProductGraph } from "../src/product-graph/validator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const factoryRoot = path.join(repoRoot, "factory");

function listChangedFiles(): string[] {
  try {
    const output = execSync("git diff --name-only HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const graph = await loadProductGraph(factoryRoot);
  const validationFindings = validateProductGraph(graph);
  const coverageFindings = analyzeCoverage(graph, {
    changedFiles: listChangedFiles(),
    changedSymbols: [],
    changedTests: [],
    telemetryKeys: [],
  });
  const findings = [...validationFindings, ...coverageFindings];

  if (findings.length === 0) {
    console.log(`factory contract check passed for ${graph.product}@${graph.factoryVersion}`);
    return;
  }

  for (const finding of findings) {
    const location = [finding.nodeId, finding.path].filter(Boolean).join(" @ ");
    console.error(`${finding.code}: ${finding.message}${location ? ` (${location})` : ""}`);
  }
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
