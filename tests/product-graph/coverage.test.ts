import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProductGraph } from "../../src/product-graph/loader.js";
import { analyzeCoverage, mapChangesToNodes } from "../../src/product-graph/coverage.js";
import { validateProductGraph } from "../../src/product-graph/validator.js";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("product graph coverage", () => {
  it("passes forward coverage for a valid graph", async () => {
    const graph = await loadProductGraph(path.join(fixturesRoot, "valid/factory"));
    const findings = analyzeCoverage(graph, {
      changedFiles: ["src/temporal/workflows/factory-workflow.ts"],
      changedSymbols: [],
      changedTests: [],
      telemetryKeys: [],
    });

    expect(validateProductGraph(graph)).toEqual([]);
    expect(findings).toEqual([]);
  });

  it("reports uncovered acceptance criteria without scenario evidence", async () => {
    const graph = await loadProductGraph(path.join(fixturesRoot, "uncovered/factory"));
    const findings = analyzeCoverage(graph);

    expect(findings).toEqual([
      expect.objectContaining({
        code: "uncovered_acceptance",
        nodeId: "AC-001",
      }),
    ]);
  });

  it("reports untraced production changes", async () => {
    const graph = await loadProductGraph(path.join(fixturesRoot, "untraced/factory"));
    const findings = analyzeCoverage(graph, {
      changedFiles: ["src/api/server.ts"],
      changedSymbols: [],
      changedTests: [],
      telemetryKeys: [],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        code: "untraced_change",
        path: "src/api/server.ts",
      }),
    ]);
  });

  it("allows repair findings to bypass untraced change detection", async () => {
    const graph = await loadProductGraph(path.join(fixturesRoot, "untraced/factory"));
    const findings = analyzeCoverage(graph, {
      changedFiles: ["src/api/server.ts"],
      changedSymbols: [],
      changedTests: [],
      telemetryKeys: [],
      repairFinding: "repair-loop routed gate failure",
    });

    expect(findings.some((finding) => finding.code === "untraced_change")).toBe(false);
  });

  it("maps changed files, symbols, tests and telemetry to traced nodes", async () => {
    const graph = await loadProductGraph(path.join(fixturesRoot, "valid/factory"));
    const matches = mapChangesToNodes(graph, {
      changedFiles: ["src/temporal/workflows/factory-workflow.ts"],
      changedSymbols: ["src/temporal/workflows/run-node.ts#executeNode"],
      changedTests: ["tests/temporal/factory-workflow.test.ts"],
      telemetryKeys: ["factory.workflow.attempts"],
    });

    expect(matches.get("INV-001")).toEqual([
      "file:src/temporal/workflows/factory-workflow.ts",
      "symbol:src/temporal/workflows/run-node.ts#executeNode",
    ]);
    expect(matches.get("REQ-001")).toEqual([
      "file:src/temporal/workflows/factory-workflow.ts",
      "symbol:src/temporal/workflows/run-node.ts#executeNode",
    ]);
  });
});
