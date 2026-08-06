import { clusterFeedback } from "../feedback/cluster.js";
import type { FeedbackIngest, FeedbackIngestResult } from "../feedback/ingest.js";
import type { GeneratedWorkOrder } from "../feedback/types.js";
import { generateWorkOrder } from "../feedback/work-order.js";
import { buildAssurancePlan } from "../policy/policy-loader.js";
import type { WorkflowStarter } from "../tasks/reconciler.js";

export interface FeedbackReconcilerInput {
  readonly ingest: FeedbackIngest;
  readonly projection: {
    getFeedbackTraceability(feedbackId: string): Promise<import("../feedback/types.js").FeedbackTraceability | null>;
  };
  readonly workflows: WorkflowStarter;
  readonly repository: string;
}

export interface FeedbackReconcileResult {
  readonly ingest: FeedbackIngestResult;
  readonly workOrder?: GeneratedWorkOrder;
  readonly workflowStarted: boolean;
}

export class FeedbackReconciler {
  constructor(private readonly deps: FeedbackReconcilerInput) {}

  getTraceability(feedbackId: string) {
    return this.deps.projection.getFeedbackTraceability(feedbackId);
  }

  async reconcile(input: Parameters<FeedbackIngest["ingest"]>[0]): Promise<FeedbackReconcileResult> {
    const ingestResult = await this.deps.ingest.ingest(input);
    if (!ingestResult.inserted) {
      return { ingest: ingestResult, workflowStarted: false };
    }

    const traceability = await this.deps.projection.getFeedbackTraceability(ingestResult.feedback.feedbackId);
    if (!traceability) {
      return { ingest: ingestResult, workflowStarted: false };
    }

    const clusters = clusterFeedback([ingestResult.feedback]);
    const workOrder = generateWorkOrder(clusters[0]!, traceability, 1);
    const plan = buildAssurancePlan({
      title: workOrder.title,
      description: workOrder.title,
      workflow: "feature",
      repository: this.deps.repository,
    });

    await this.deps.workflows.start({
      runId: traceability.runId,
      taskId: workOrder.id,
      repository: this.deps.repository,
      baseBranch: "main",
      workflow: "feature",
      deploymentProfile: "staging",
      sandboxProfile: "crabbox",
      title: workOrder.title,
      description: [
        workOrder.title,
        `incident=${traceability.incidentId}`,
        `deployment=${traceability.deploymentId}`,
        `artifact=${traceability.artifactDigest}`,
        `feedback=${traceability.feedbackId}`,
      ].join(" | "),
      policyVersion: plan.policyVersion,
      riskTier: workOrder.riskTier,
      assurancePlanHash: plan.planHash,
    });

    return { ingest: ingestResult, workOrder, workflowStarted: true };
  }
}
