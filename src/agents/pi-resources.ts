import { access, cp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

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
  await cp(join(sourceRoot, manifest.skillsRoot), join(destination, manifest.skillsRoot), { recursive: true, force: true });
  await cp(join(sourceRoot, manifest.webSearchConfig), join(destination, "web-search.json"));
  await assertRequiredSkills(destination, manifest.requiredSkills);
  for (const pkg of manifest.packages) {
    await execFile("pi", ["install", pkg.spec], { env: { ...process.env, PI_CODING_AGENT_DIR: destination } });
  }
  await assertRequiredSkills(destination, manifest.requiredSkills);
}
