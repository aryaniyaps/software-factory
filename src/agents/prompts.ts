import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContextPacket, type ContextPacketInput } from "./context-packet.js";
import { harnessForRole, roleAgentDir } from "./role-harness.js";

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), "prompts");

const PROMPT_FILES: Record<string, string> = {
  scout: "scout.md",
  plan: "plan.md",
  implement: "implement.md",
  repair: "repair.md",
  "repair:maintainability_refactor": "repair-maintainability.md",
  review: "review.md",
  maintainability_critic: "maintainability-critic.md",
};

function loadPrompt(fileName: string): string {
  return readFileSync(join(promptsDir, fileName), "utf8").trim();
}

export function promptForRole(role: string, mode?: string, cwd?: string): string {
  if (cwd) {
    const harness = harnessForRole(role);
    const agentDir = roleAgentDir(cwd, role);
    try {
      return readFileSync(join(agentDir, harness.systemPromptPath), "utf8").trim();
    } catch {
      // fall through
    }
  }
  if (role === "repair" && mode === "maintainability_refactor") {
    return loadPrompt(PROMPT_FILES["repair:maintainability_refactor"]);
  }
  const fileName = PROMPT_FILES[role];
  if (!fileName) return `Execute the ${role} phase and return the required JSON envelope.`;
  return loadPrompt(fileName);
}

export function buildAgentPrompt(input: ContextPacketInput & { cwd?: string }): string {
  return buildContextPacket(input);
}

export function buildLegacyAgentPrompt(input: {
  role: string;
  mode?: string;
  memoryContext?: string;
  payload: unknown;
}): string {
  const system = promptForRole(input.role, input.mode);
  const sections = [
    system,
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : "",
    `Input:\n${JSON.stringify(input.payload)}`,
  ].filter(Boolean);
  return sections.join("\n\n");
}
