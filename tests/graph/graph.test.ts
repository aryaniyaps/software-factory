import { describe, expect, it } from "vitest";
import { readyNodes, type WorkflowGraph } from "../../src/graph/graph.js";

const node = (id: string, status: "pending" | "succeeded" | "failed" = "pending") => ({
  id,
  runId: "run-1",
  kind: "deterministic" as const,
  name: id,
  status,
  attempt: 0,
  input: {},
});

describe("readyNodes", () => {
  it("returns independent pending roots in stable order", () => {
    const graph: WorkflowGraph = {
      nodes: [node("b"), node("a")],
      edges: [],
    };
    expect(readyNodes(graph).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("waits until every predecessor succeeds", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "succeeded"), node("b", "succeeded"), node("c")],
      edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }],
    };
    expect(readyNodes(graph).map((item) => item.id)).toEqual(["c"]);
  });

  it("does not run a node after a failed predecessor", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "failed"), node("b")],
      edges: [{ from: "a", to: "b" }],
    };
    expect(readyNodes(graph)).toEqual([]);
  });
});
