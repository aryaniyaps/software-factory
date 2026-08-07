import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContextPacket, type ContextPacketInput } from "./context-packet.js";
import { harnessForRole, roleAgentDir } from "./role-harness.js";

function resolvePromptsDir(): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), "prompts"),
    join(process.cwd(), "src/agents/prompts"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "scout.md"))) return dir;
  }
  return candidates[0]!;
}

const promptsDir = resolvePromptsDir();

const PROMPT_FILES: Record<string, string> = {
  scout: "scout.md",
  plan: "plan.md",
  discovery_plan: "discovery-plan.md",
  implement: "implement.md",
  repair: "repair.md",
  "repair:maintainability_refactor": "repair-maintainability.md",
  review: "review.md",
  maintainability_critic: "maintainability-critic.md",
};

function loadPrompt(fileName: string): string {
  return readFileSync(join(promptsDir, fileName), "utf8").trim();
}

function tryRead(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return undefined;
  }
}

/** Prefer bootstrapped / repo harness system prompts (JSON contract) over short legacy stubs. */
export function promptForRole(role: string, mode?: string, _cwd?: string): string {
  if (role === "repair" && mode === "maintainability_refactor") {
    return loadPrompt(PROMPT_FILES["repair:maintainability_refactor"]);
  }

  const harness = harnessForRole(role);
  const candidates: string[] = [];
  const resourceRoot = process.env.PI_RESOURCE_ROOT?.trim();
  if (resourceRoot) {
    candidates.push(join(roleAgentDir(resourceRoot, role, "bootstrapped"), harness.systemPromptPath));
  }
  candidates.push(join(process.cwd(), "infra/pi/roles", role, harness.systemPromptPath));

  for (const path of candidates) {
    const text = tryRead(path);
    if (text) return text;
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
