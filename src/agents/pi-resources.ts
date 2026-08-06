import { access, cp, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { AgentRoles } from "../contracts/nodes.js";
import { harnessForRole, ROLE_HARNESS_SPECS } from "./role-harness.js";

const execFile = promisify(nodeExecFile);

export interface PiResourceManifest {
  packages: Array<{ name: string; version: string; spec: string }>;
  skillsRoot: string;
  webSearchConfig: string;
  requiredSkills: string[];
}

export function factoryResourceRoot(env: Record<string, string | undefined> = process.env): string {
  return env.PI_RESOURCE_ROOT ?? "/opt/software-factory/pi-resources";
}

export async function assertRequiredSkills(root: string, paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await access(resolve(root, path));
    } catch {
      throw new Error(`missing factory skill: ${path}`);
    }
  }
}

export async function bootstrapPiResources(manifest: PiResourceManifest, destination: string, sourceRoot: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const sharedDir = join(destination, "shared");
  await cp(join(sourceRoot, manifest.skillsRoot), join(sharedDir, manifest.skillsRoot), { recursive: true, force: true });
  await cp(join(sourceRoot, manifest.webSearchConfig), join(destination, "web-search.json"));
  await assertRequiredSkills(sharedDir, manifest.requiredSkills);
  for (const pkg of manifest.packages) {
    await execFile("pi", ["install", pkg.spec], { env: { ...process.env, PI_CODING_AGENT_DIR: destination } });
  }
  await bootstrapRoleHarnesses(destination, sourceRoot, manifest);
  await assertRequiredSkills(sharedDir, manifest.requiredSkills);
}

export async function bootstrapRoleHarnesses(destination: string, sourceRoot: string, manifest: PiResourceManifest): Promise<void> {
  for (const role of AgentRoles) {
    const spec = harnessForRole(role);
    const roleDir = join(destination, "roles", role);
    await mkdir(join(roleDir, "skills"), { recursive: true });
    await mkdir(join(roleDir, "prompts"), { recursive: true });
    await mkdir(join(roleDir, "mcp"), { recursive: true });
    await mkdir(join(roleDir, "policy"), { recursive: true });
    await mkdir(join(roleDir, "extensions"), { recursive: true });

    for (const skillPath of spec.skills) {
      const skillName = basename(dirname(skillPath));
      const sourceSkillDir = join(sourceRoot, dirname(skillPath));
      const targetSkillDir = join(roleDir, "skills", skillName);
      await cp(sourceSkillDir, targetSkillDir, { recursive: true, force: true });
    }

    const promptSource = join(sourceRoot, "infra/pi/roles", role, "prompts", "system.md");
    const promptFallback = join(sourceRoot, "src/agents/prompts", `${role}.md`);
    try {
      await cp(promptSource, join(roleDir, spec.systemPromptPath), { force: true });
    } catch {
      await cp(promptFallback, join(roleDir, spec.systemPromptPath), { force: true });
    }

    await writeFile(join(roleDir, "mcp", "servers.json"), JSON.stringify({
      context7: { endpoint: process.env.CONTEXT7_MCP_URL ?? "https://mcp.context7.com/mcp" },
      "factory-evidence": { endpoint: "in-process" },
    }, null, 2));

    await writeFile(join(roleDir, "policy", "mcp-gateway.yaml"), buildGatewayPolicy(spec));
  }
}

function buildGatewayPolicy(spec: (typeof ROLE_HARNESS_SPECS)[keyof typeof ROLE_HARNESS_SPECS]): string {
  const allowedTools = Object.fromEntries(spec.mcpServers.map((server) => [server.id, server.allowedTools]));
  return [
    "denyByDefault: true",
    "audit: true",
    `allowedServers: [${spec.mcpServers.map((server) => `"${server.id}"`).join(", ")}]`,
    "allowedTools:",
    ...Object.entries(allowedTools).flatMap(([server, tools]) => [
      `  ${server}: [${tools.map((tool) => `"${tool}"`).join(", ")}]`,
    ]),
  ].join("\n");
}
