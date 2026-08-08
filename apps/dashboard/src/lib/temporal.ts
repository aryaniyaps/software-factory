/** Deep link into Temporal Web UI for a factory workflow. */
export function temporalWorkflowUrl(runId: string, workflowId?: string): string | null {
  const base = import.meta.env.VITE_TEMPORAL_UI_URL?.trim();
  if (!base) return null;
  const namespace = import.meta.env.VITE_TEMPORAL_NAMESPACE?.trim() || "default";
  const wfId = workflowId ?? `factory-${runId}`;
  return `${base.replace(/\/$/, "")}/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(wfId)}`;
}
