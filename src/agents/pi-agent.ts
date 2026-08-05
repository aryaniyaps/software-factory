import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { AgentRunner } from "./agent-node.js";
import { createContext7Tool, createWebSearchTool } from "./tools.js";
import { Context7Client, WebSearchClient } from "../integrations/research.js";
import { join } from "node:path";
import { createGondolinSession } from "./gondolin-session.js";
import { profileForRole } from "./role-profiles.js";

export class PiAgentRunner implements AgentRunner {
  async run(input: { role: string; prompt: string; cwd: string; tools: string[]; metadata: Record<string, string> }): Promise<{ text: string; sessionId: string }> {
    const profile = profileForRole(input.role);
    const modelRuntime = await ModelRuntime.create({ modelsPath: process.env.PI_MODELS_PATH ?? join(input.cwd, "infra/pi/models.json") });
    const model = modelRuntime.getModel("litellm", "factory/default");
    const customTools = [
      ...(profile.tools.includes("context7") ? [createContext7Tool(new Context7Client())] : []),
      ...(profile.webSearch ? [createWebSearchTool(new WebSearchClient())] : []),
    ];
    const { session, close } = await createGondolinSession({
      cwd: input.cwd,
      model,
      modelRuntime,
      sessionManager: SessionManager.inMemory(input.cwd),
      tools: [...profile.tools],
      customTools,
      thinkingLevel: profile.thinkingLevel,
      role: input.role,
      resourceRoot: process.env.PI_RESOURCE_ROOT,
    });
    let text = "";
    session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") text += event.assistantMessageEvent.delta;
    });
    await session.prompt(`${input.prompt}\nCorrelation metadata: ${JSON.stringify(input.metadata)}`);
    close();
    return { text, sessionId: session.sessionId };
  }
}
