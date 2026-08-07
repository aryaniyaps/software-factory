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

export interface CorrelationMetadata extends Record<string, string | string[] | undefined> {
  session_id: string;
  trace_id: string;
  generation_name: string;
  trace_name: string;
  tags: string[];
}

/** @deprecated Use CorrelationMetadata */
export type LiteLLMMetadata = CorrelationMetadata;

export function correlationTags(context: CorrelationContext): string[] {
  return [
    context.organization && `org:${context.organization}`,
    context.project && `project:${context.project}`,
    context.repository && `repository:${context.repository}`,
    `run:${context.factoryRunId}`,
    context.initiativeId && `initiative:${context.initiativeId}`,
    context.agentRole && `role:${context.agentRole}`,
    `phase:${context.phaseId}`,
    context.worktreeId && `worktree:${context.worktreeId}`,
  ].filter((tag): tag is string => Boolean(tag));
}

/** @deprecated Use correlationTags */
export const litellmTags = correlationTags;

export function correlationToMetadata(context: CorrelationContext): CorrelationMetadata {
  const traceId = [context.factoryRunId, context.ticketId, context.attemptId].join(":");
  const role = context.agentRole ?? context.phaseId;
  return {
    session_id: context.factoryRunId,
    trace_id: traceId,
    generation_name: context.phaseId,
    trace_name: role,
    tags: correlationTags(context),
    factory_run_id: context.factoryRunId,
    ticket_id: context.ticketId,
    attempt_id: context.attemptId,
    phase_id: context.phaseId,
    ...(context.initiativeId ? { initiative_id: context.initiativeId } : {}),
    ...(context.agentRole ? { agent_role: context.agentRole } : {}),
    ...(context.worktreeId ? { worktree_id: context.worktreeId } : {}),
    ...(context.organization ? { organization: context.organization } : {}),
    ...(context.project ? { project: context.project } : {}),
    ...(context.repository ? { repository: context.repository } : {}),
  };
}

/** @deprecated Use correlationToMetadata */
export const correlationToLiteLLMMetadata = correlationToMetadata;

export function correlationToAgentMetadata(context: CorrelationContext): Record<string, string> {
  const metadata = correlationToMetadata(context);
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value)]),
  );
}
