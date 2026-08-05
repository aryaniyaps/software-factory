import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type AgentSession,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";

export function gondolinExtensionPath(cwd: string): string {
  return join(cwd, "node_modules/@earendil-works/pi-coding-agent/examples/extensions/gondolin");
}

export async function createGondolinSession(options: Omit<CreateAgentSessionOptions, "resourceLoader"> & { cwd: string }): Promise<{ session: AgentSession; close: () => void }> {
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: getAgentDir(),
    additionalExtensionPaths: [process.env.GONDOLIN_EXTENSION_PATH ?? gondolinExtensionPath(options.cwd)],
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ ...options, resourceLoader });
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
