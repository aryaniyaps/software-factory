import { describe, expect, it } from "vitest";
import { clusterFeedback } from "../../src/feedback/cluster.js";
import type { NormalizedFeedback } from "../../src/feedback/types.js";

const evidenceRef = (id: string) => ({
  schemaVersion: "evidence-ref.v1" as const,
  id,
  sha256: "a".repeat(64),
  uri: `file:///${id}`,
});

function feedback(id: string, summary: string): NormalizedFeedback {
  return {
    feedbackId: id,
    source: "incident",
    externalId: id,
    summary,
    evidenceRefs: [evidenceRef(`ev-${id}`)],
  };
}

describe("feedback clustering", () => {
  it("groups similar themes while preserving all verbatim evidence references", () => {
    const items = [
      feedback("fb-1", "Checkout timeout on production"),
      feedback("fb-2", "Checkout TIMEOUT in prod!"),
      feedback("fb-3", "Login page styling broken"),
    ];

    const clusters = clusterFeedback(items);

    expect(clusters).toHaveLength(2);
    const checkout = clusters.find((c) => c.theme.includes("checkout"));
    expect(checkout?.memberFeedbackIds).toEqual(expect.arrayContaining(["fb-1", "fb-2"]));
    expect(checkout?.verbatimEvidenceRefs).toHaveLength(2);
    expect(checkout?.verbatimEvidenceRefs.map((r) => r.id)).toEqual(expect.arrayContaining(["ev-fb-1", "ev-fb-2"]));
  });

  it("keeps distinct themes in separate clusters", () => {
    const items = [
      feedback("fb-a", "Database connection pool exhausted"),
      feedback("fb-b", "UI button misaligned on mobile"),
    ];

    const clusters = clusterFeedback(items);
    expect(clusters).toHaveLength(2);
    for (const cluster of clusters) {
      expect(cluster.memberFeedbackIds).toHaveLength(1);
      expect(cluster.verbatimEvidenceRefs).toHaveLength(1);
    }
  });

  it("does not drop evidence when a cluster has a single member", () => {
    const items = [feedback("fb-solo", "Memory leak in worker process")];
    const clusters = clusterFeedback(items);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.verbatimEvidenceRefs[0]?.id).toBe("ev-fb-solo");
  });
});
