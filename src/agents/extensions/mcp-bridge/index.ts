/**
 * Factory MCP bridge — registers allowlisted Context7 and factory-evidence tools at session start.
 * AGT-style gateway enforcement runs in the host runner before tools are passed to Pi.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function factoryMcpBridgeExtension(pi: ExtensionAPI) {
  pi.on("session_start", () => {
    // Tools are registered by PiAgentRunner via customTools; extension slot reserved for future dynamic MCP servers.
  });
}
