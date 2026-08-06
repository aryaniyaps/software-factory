import { describe, expect, it } from "vitest";
import { generateWorkOrder } from "../../src/feedback/work-order.js";
import type { FeedbackCluster, FeedbackTraceability } from "../../src/feedback/types.js";

const traceability: FeedbackTraceability = {
  feedbackId: "incident:inc-001",
  incidentId: "inc-001",
  deploymentId: "run-abc-sha256:abc",
  artifactDigest: "sha256:abc",
  runId: "run-abc",
  evidenceRefs: [{
    schemaVersion: "evidence-ref.v1",
    id: "ev-inc-001",
    sha256: "a".repeat(64),
    uri: "file:///ev-inc-001",
  }],
};

const cluster: FeedbackCluster = {
  clusterId: "cluster-checkout-timeout",
  theme: "checkout timeout production",
  memberFeedbackIds: ["incident:inc-001"],
  verbatimEvidenceRefs: traceability.evidenceRefs,
};

describe("feedback work order generation", () => {
  it("generates work orders with requirement and acceptance IDs", () => {
    const workOrder = generateWorkOrder(cluster, traceability, 1);

    expect(workOrder.id).toBe("WO-FB-001");
    expect(workOrder.requirements.length).toBeGreaterThan(0);
    expect(workOrder.acceptance.length).toBeGreaterThan(0);
    expect(workOrder.requirements.every((id) => id.startsWith("REQ-"))).toBe(true);
    expect(workOrder.acceptance.every((id) => id.startsWith("AC-"))).toBe(true);
  });

  it("includes risk classification from feedback content", () => {
    const workOrder = generateWorkOrder(cluster, traceability, 1);
    expect(["T0", "T1", "T2", "T3"]).toContain(workOrder.riskTier);
  });

  it("embeds full traceability chain for incident-derived tasks", () => {
    const workOrder = generateWorkOrder(cluster, traceability, 1);

    expect(workOrder.traceability.incidentId).toBe("inc-001");
    expect(workOrder.traceability.deploymentId).toBe("run-abc-sha256:abc");
    expect(workOrder.traceability.artifactDigest).toBe("sha256:abc");
    expect(workOrder.traceability.runId).toBe("run-abc");
    expect(workOrder.traceability.evidenceRefs[0]?.id).toBe("ev-inc-001");
  });

  it("navigates from work order back to all traceability anchors", () => {
    const workOrder = generateWorkOrder(cluster, traceability, 2);
    const chain = workOrder.traceability;

    expect(chain.incidentId).toBeTruthy();
    expect(chain.deploymentId).toContain(chain.runId);
    expect(chain.artifactDigest).toMatch(/^sha256:/);
    expect(chain.evidenceRefs.length).toBeGreaterThan(0);
  });
});
