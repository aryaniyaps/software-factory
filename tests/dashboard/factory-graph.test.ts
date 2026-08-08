import { describe, expect, it } from "vitest";
import { buildFactoryGraph } from "../../apps/dashboard/src/graph/factory-graph.js";

describe("dashboard execution graph", () => {
  it("renders nodes and edges supplied by the Temporal query without a local topology", () => {
    const graph = buildFactoryGraph({
      version: "factory-graph.v2",
      nodes: [
        { id: "alpha", label: "Alpha", kind: "activity", status: "succeeded", attemptCount: 1 },
        { id: "omega", label: "Omega", kind: "release", status: "running", attemptCount: 2 },
      ],
      edges: [{ id: "custom", source: "alpha", target: "omega", condition: "succeeded" }],
    });

    expect(graph.nodes.map((node) => node.id)).toEqual(["alpha", "omega"]);
    expect(graph.nodes[1]?.data).toMatchObject({ label: "Omega", status: "running", attemptCount: 2 });
    expect(graph.edges).toEqual([expect.objectContaining({ id: "custom", source: "alpha", target: "omega" })]);
  });
});
