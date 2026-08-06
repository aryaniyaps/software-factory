import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  type AgentSession,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
import { harnessForRole } from "./role-harness.js";
import { roleLoaderOptionsForWorktree } from "./role-profiles.js";

export function gondolinExtensionPath(cwd: string): string {
  return join(cwd, "node_modules/@earendil-works/pi-coding-agent/examples/extensions/gondolin");
}

export function mcpBridgeExtensionPath(factoryRoot: string): string {
  return join(factoryRoot, "src/agents/extensions/mcp-bridge");
}

type GondolinSessionOptions = Omit<CreateAgentSessionOptions, "resourceLoader"> & {
  cwd: string;
  role?: string;
  resourceRoot?: string;
  factoryRoot: string;
};

function loadSystemPrompt(agentDir: string, role: string): string | undefined {
  const harness = harnessForRole(role);
  const path = join(agentDir, harness.systemPromptPath);
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return undefined;
  }
}

export async function createGondolinSession(options: GondolinSessionOptions & { systemPrompt?: string }): Promise<{ session: AgentSession; close: () => void }> {
  const { role, resourceRoot, factoryRoot, systemPrompt: systemPromptOverride, ...sessionOptions } = options;
  const loaderInput = role
    ? roleLoaderOptionsForWorktree({ role, cwd: factoryRoot, resourceRoot })
    : { agentDir: resourceRoot ?? process.env.PI_RESOURCE_ROOT ?? factoryRoot, additionalSkillPaths: [] as string[] };
  const systemPrompt = systemPromptOverride ?? (role ? loadSystemPrompt(loaderInput.agentDir, role) : undefined);
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: loaderInput.agentDir,
    additionalSkillPaths: loaderInput.additionalSkillPaths,
    additionalExtensionPaths: [
      process.env.GONDOLIN_EXTENSION_PATH ?? gondolinExtensionPath(factoryRoot),
      mcpBridgeExtensionPath(factoryRoot),
    ],
    ...(systemPrompt ? { systemPrompt } : {}),
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ ...sessionOptions, cwd: options.cwd, resourceLoader });
  let closed = false;
  return {
    session,
    close: () => {
      if (!closed) {
        closed = true;
        session.dispose();
      }
    },
  };
}
