import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function sha256Hex(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

export interface ObjectStorePutResult {
  sha256: string;
  uri: string;
}

export interface ObjectStore {
  put(path: string, body: Buffer | string): Promise<ObjectStorePutResult>;
  get(path: string): Promise<Buffer>;
  verify(path: string, expectedSha256: string): Promise<boolean>;
}

export class HashMismatchError extends Error {
  constructor(path: string, expected: string, actual: string) {
    super(`Object hash mismatch for ${path}: expected ${expected}, got ${actual}`);
    this.name = "HashMismatchError";
  }
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

export function createFilesystemObjectStore(root: string): ObjectStore {
  return {
    async put(path, body) {
      const sha256 = sha256Hex(body);
      const filePath = join(root, normalizePath(path));
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      await writeFile(filePath, body, { mode: 0o600 });
      return { sha256, uri: `file://${filePath}` };
    },
    async get(path) {
      return await readFile(join(root, normalizePath(path)));
    },
    async verify(path, expectedSha256) {
      const actual = sha256Hex(await this.get(path));
      if (actual !== expectedSha256) throw new HashMismatchError(path, expectedSha256, actual);
      return true;
    },
  };
}
