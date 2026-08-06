export interface NodeContext {
  runId: string;
  ticketId: string;
  attemptId: string;
  worktreePath: string;
}

export interface WorkflowNode<I = object, O = object> {
  name: string;
  kind: "deterministic" | "agent";
  run(input: I, context: NodeContext): Promise<O>;
}
