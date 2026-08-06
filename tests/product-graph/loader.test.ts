import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hashProductGraph } from "../../src/contracts/product-graph.js";
import {
  createRunSnapshot,
  loadFactoryManifest,
  loadProductGraph,
  loadWorkOrders,
} from "../../src/product-graph/loader.js";
import { validateProductGraph } from "../../src/product-graph/validator.js";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("product graph loader", () => {
  it("loads a valid REQ/INV/AC/SCN/FIT/PRB graph with stable IDs", async () => {
    const factoryRoot = path.join(fixturesRoot, "valid/factory");
    const manifest = await loadFactoryManifest(factoryRoot);
    const graph = await loadProductGraph(factoryRoot);

    expect(manifest).toEqual({
      schemaVersion: "factory.v1",
      product: "fixture-product",
      version: "1",
    });
    expect(graph.schemaVersion).toBe("product-graph.v1");
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "AC-001", "FIT-001", "INV-001", "PRB-001", "REQ-001", "SCN-001",
    ]);
    expect(validateProductGraph(graph)).toEqual([]);
  });

  it("loads versioned work orders and creates immutable run snapshots", async () => {
    const factoryRoot = path.join(fixturesRoot, "valid/factory");
    const graph = await loadProductGraph(factoryRoot);
    const [workOrder] = await loadWorkOrders(factoryRoot);

    expect(workOrder).toMatchObject({
      id: "WO-001",
      version: 2,
      requirements: ["REQ-001"],
      acceptance: ["AC-001"],
    });

    const snapshot = createRunSnapshot(graph, workOrder, {
      snapshotId: "snapshot-test",
      capturedAt: "2026-08-06T00:00:00.000Z",
    });

    expect(snapshot.graphHash).toBe(hashProductGraph(graph));
    expect(snapshot.workOrderVersion).toBe(2);
    expect(snapshot.graph).toEqual(graph);
  });

  it("reports dangling references", async () => {
    const graph = await loadProductGraph(path.join(fixturesRoot, "dangling-refs/factory"));
    const findings = validateProductGraph(graph);

    expect(findings.map((finding) => finding.code)).toEqual([
      "dangling_ref",
      "dangling_ref",
    ]);
    expect(findings.some((finding) => finding.message.includes("AC-MISSING"))).toBe(true);
    expect(findings.some((finding) => finding.message.includes("INV-MISSING"))).toBe(true);
  });

  it("reports duplicate IDs", async () => {
    const graph = await loadProductGraph(path.join(fixturesRoot, "duplicate-ids/factory"));
    const findings = validateProductGraph(graph);

    expect(findings.some((finding) => finding.code === "duplicate_id")).toBe(true);
    expect(findings.some((finding) => finding.nodeId === "REQ-001")).toBe(true);
  });
});
