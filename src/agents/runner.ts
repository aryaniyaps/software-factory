export interface AgentRunner {
  run(input: {
    role: string;
    prompt: string;
    cwd: string;
    tools: string[];
    metadata: Record<string, string>;
    systemPrompt?: string;
    onHeartbeat?: () => void;
  }): Promise<{
    text: string;
    sessionId: string;
    toolCalls?: AgentToolCallRecord[];
  }>;
}

export interface AgentToolCallRecord {
  callId: string;
  toolName: string;
  status: "succeeded" | "failed";
  input: unknown;
  output: unknown;
  startedAt: string;
  completedAt: string;
}
