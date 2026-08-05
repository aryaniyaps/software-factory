import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { AgentRunner } from "./agent-node.js";

export class PiAgentRunner implements AgentRunner {
  async run(input: { role: string; prompt: string; cwd: string; tools: string[]; metadata: Record<string, string> }): Promise<{ text: string; sessionId: string }> {
    const modelRuntime = await ModelRuntime.create();
    const { session } = await createAgentSession({
      cwd: input.cwd,
      modelRuntime,
      sessionManager: SessionManager.inMemory(input.cwd),
      tools: input.tools.filter((tool) => ["read", "bash", "edit", "write", "grep", "find", "ls"].includes(tool)),
    });
    let text = "";
    session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") text += event.assistantMessageEvent.delta;
    });
    await session.prompt(`${input.prompt}\nCorrelation metadata: ${JSON.stringify(input.metadata)}`);
    session.dispose();
    return { text, sessionId: session.sessionId };
  }
}
