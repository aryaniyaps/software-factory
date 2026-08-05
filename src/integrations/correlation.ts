export interface CorrelationContext {
  factoryRunId: string;
  initiativeId?: string;
  ticketId: string;
  attemptId: string;
  phaseId: string;
  agentRole?: string;
  worktreeId?: string;
  organization?: string;
  project?: string;
  repository?: string;
}

export function documentId(context: CorrelationContext): string {
  return [context.factoryRunId, context.ticketId, context.attemptId, context.phaseId].join(":");
}
