import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type AgentSession,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
import { roleLoaderOptions } from "./role-profiles.js";

export function gondolinExtensionPath(cwd: string): string {
  return join(cwd, "node_modules/@earendil-works/pi-coding-agent/examples/extensions/gondolin");
}

type GondolinSessionOptions = Omit<CreateAgentSessionOptions, "resourceLoader"> & {
  cwd: string;
  role?: string;
  resourceRoot?: string;
};

export async function createGondolinSession(options: GondolinSessionOptions): Promise<{ session: AgentSession; close: () => void }> {
  const { role, resourceRoot, ...sessionOptions } = options;
  const agentDir = resourceRoot ?? process.env.PI_RESOURCE_ROOT ?? getAgentDir();
  const loaderOptions = role ? roleLoaderOptions(role, agentDir) : { agentDir, additionalSkillPaths: [] };
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    ...loaderOptions,
    additionalExtensionPaths: [process.env.GONDOLIN_EXTENSION_PATH ?? gondolinExtensionPath(options.cwd)],
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
