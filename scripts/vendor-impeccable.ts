import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const version = process.argv[2] ?? "3.5.0";
const bundleUrl = "https://impeccable.style/api/download/bundle/universal";
const targetDir = resolve(root, "src/agents/skills/impeccable");
const tmpDir = resolve(root, ".tmp/impeccable-bundle");

async function downloadBundle(): Promise<void> {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  const archivePath = resolve(tmpDir, "bundle.zip");
  const response = await fetch(bundleUrl);
  if (!response.ok || !response.body) {
    throw new Error(`failed to download impeccable bundle: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(archivePath));
  await exec("unzip", ["-q", archivePath, "-d", tmpDir]);
}

async function copyPiSkill(): Promise<void> {
  const source = resolve(tmpDir, ".pi/skills/impeccable");
  await rm(targetDir, { recursive: true, force: true });
  await exec("cp", ["-r", source, targetDir]);
  await writeFile(resolve(targetDir, "REVISION"), `${version}\n`);
}

await downloadBundle();
await copyPiSkill();
await rm(tmpDir, { recursive: true, force: true });
console.log(`Vendored impeccable@${version} to src/agents/skills/impeccable/`);
