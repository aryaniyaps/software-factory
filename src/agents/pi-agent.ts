import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { AgentRunner, AgentToolCallRecord } from "./runner.js";
import { createGondolinSession } from "./gondolin-session.js";
import { resolveModel } from "./model-resolver.js";
import { harnessForRole } from "./role-harness.js";
import { mcpToolsForRole, toolsForRole } from "./tool-policy.js";
import { parseCriticReport } from "../assurance/maintainability/findings.js";
import { withSpan } from "../telemetry/bootstrap.js";
import { recordToolCall } from "../telemetry/metrics.js";
import { loadGatewayPolicyFromAllowlist } from "./mcp-gateway.js";
import { createContext7McpTools } from "./context7-mcp-tools.js";
import { createGetEvidenceTool, createListEvidenceMetaTool } from "./factory-evidence-tools.js";

export class PiAgentRunner implements AgentRunner {
  async run(input: {
    role: string;
    prompt: string;
    cwd: string;
    tools: string[];
    metadata: Record<string, string>;
    systemPrompt?: string;
  }): Promise<{ text: string; sessionId: string; toolCalls: AgentToolCallRecord[] }> {
    const harness = harnessForRole(input.role);
    const allowedTools = toolsForRole(input.role);
    const gateway = loadGatewayPolicyFromAllowlist(allowedTools);
    const factoryRoot = process.env.FACTORY_REPO_ROOT ?? process.cwd();
    const { provider, modelId } = resolveModel(input.role);
    const modelRuntime = await ModelRuntime.create({
      // Built-in providers (openai-codex, etc.). Optional PI_MODELS_PATH for custom model overlays.
      modelsPath: process.env.PI_MODELS_PATH ?? null,
      ...(process.env.PI_AUTH_PATH ? { authPath: process.env.PI_AUTH_PATH } : {}),
    });
    const model = modelRuntime.getModel(provider, modelId);
    if (!model) {
      throw new Error(`Unknown model ${provider}/${modelId}. Check FACTORY_MODEL_PROVIDER / FACTORY_MODEL* and Pi auth.`);
    }
    const mcpToolSet = new Set(mcpToolsForRole(input.role));
    const customTools = [
      ...createContext7McpTools().filter((tool) => gateway.isAllowed(tool.name) && mcpToolSet.has(tool.name)),
      ...(mcpToolSet.has("get_evidence") ? [instrumentTool("get_evidence", createGetEvidenceTool())] : []),
      ...(mcpToolSet.has("list_evidence_meta") ? [instrumentTool("list_evidence_meta", createListEvidenceMetaTool())] : []),
    ];
    const { session, close } = await createGondolinSession({
      cwd: input.cwd,
      factoryRoot,
      model,
      modelRuntime,
      sessionManager: SessionManager.inMemory(input.cwd),
      tools: allowedTools,
      customTools,
      thinkingLevel: harness.thinkingLevel,
      role: input.role,
      resourceRoot: process.env.PI_RESOURCE_ROOT,
      systemPrompt: input.systemPrompt,
    });
    let text = "";
    const activeToolCalls = new Map<string, Omit<AgentToolCallRecord, "status" | "output" | "completedAt">>();
    const toolCalls: AgentToolCallRecord[] = [];
    session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") text += event.assistantMessageEvent.delta;
      if (event.type === "tool_execution_start") {
        activeToolCalls.set(event.toolCallId, {
          callId: event.toolCallId,
          toolName: event.toolName,
          input: event.args,
          startedAt: new Date().toISOString(),
        });
      }
      if (event.type === "tool_execution_end") {
        const started = activeToolCalls.get(event.toolCallId);
        toolCalls.push({
          callId: event.toolCallId,
          toolName: event.toolName,
          status: event.isError ? "failed" : "succeeded",
          input: started?.input ?? {},
          output: event.result,
          startedAt: started?.startedAt ?? new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        activeToolCalls.delete(event.toolCallId);
      }
    });
    await withSpan("factory.agent.turn", {
      "factory.agent.role": input.role,
      "factory.agent.provider": provider,
      "factory.agent.model": modelId,
      ...Object.fromEntries(Object.entries(input.metadata).map(([key, value]) => [`factory.${key}`, value])),
    }, async () => {
      await session.prompt(input.prompt);
    });
    close();
    return {
      text: normalizeAgentText(input.role, text),
      sessionId: session.sessionId,
      toolCalls,
    };
  }
}

function instrumentTool<T extends { name: string; execute: (...args: any[]) => Promise<unknown> }>(toolName: string, tool: T): T {
  const original = tool.execute.bind(tool);
  tool.execute = async (...args: Parameters<T["execute"]>) => withSpan("factory.tool.call", {
    "factory.tool.name": toolName,
    "factory.tool.args": JSON.stringify(args[1] ?? {}),
  }, async () => {
    recordToolCall({ "factory.tool.name": toolName });
    return original(...args);
  });
  return tool;
}

function normalizeAgentText(role: string, text: string): string {
  if (role !== "maintainability_critic") return text;
  try {
    const parsed = JSON.parse(text) as { data?: { report?: unknown } };
    if (parsed.data?.report) parseCriticReport(parsed.data.report);
  } catch {
    return text;
  }
  return text;
}
