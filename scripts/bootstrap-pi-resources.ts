import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bootstrapPiResources, factoryResourceRoot, type PiResourceManifest } from "../src/agents/pi-resources.js";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "infra/pi/resource-manifest.json"), "utf8")) as PiResourceManifest;
await bootstrapPiResources(manifest, factoryResourceRoot(), root);
