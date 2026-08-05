import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { AgentRunner } from "./agent-node.js";
import { createContext7Tool, createWebSearchTool } from "./tools.js";
import { Context7Client, WebSearchClient } from "../integrations/research.js";

export class PiAgentRunner implements AgentRunner {
  async run(input: { role: string; prompt: string; cwd: string; tools: string[]; metadata: Record<string, string> }): Promise<{ text: string; sessionId: string }> {
    const modelRuntime = await ModelRuntime.create();
    const customTools = ["scout", "plan"].includes(input.role)
      ? [createContext7Tool(new Context7Client()), createWebSearchTool(new WebSearchClient())]
      : [];
    const { session } = await createAgentSession({
      cwd: input.cwd,
      modelRuntime,
      sessionManager: SessionManager.inMemory(input.cwd),
      tools: input.tools.filter((tool) => ["read", "bash", "edit", "write", "grep", "find", "ls", "context7", "web_search"].includes(tool)),
      customTools,
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
