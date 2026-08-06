export interface AgentRunner {
  run(input: {
    role: string;
    prompt: string;
    cwd: string;
    tools: string[];
    metadata: Record<string, string>;
  }): Promise<{ text: string; sessionId: string }>;
}
