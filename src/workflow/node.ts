export interface NodeContext {
  runId: string;
  ticketId: string;
  attemptId: string;
  worktreePath: string;
}

export interface WorkflowNode<I = unknown, O = unknown> {
  name: string;
  kind: "deterministic" | "agent";
  run(input: I, context: NodeContext): Promise<O>;
}
