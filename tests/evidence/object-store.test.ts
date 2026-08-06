import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilesystemObjectStore, HashMismatchError, sha256Hex } from "../../src/evidence/object-store.js";

describe("object store", () => {
  let root = "";

  afterEach(async () => {
    root = "";
  });

  async function store() {
    root = await mkdtemp(join(tmpdir(), "evidence-store-"));
    return createFilesystemObjectStore(root);
  }

  it("stores content and returns sha256 and uri", async () => {
    const objectStore = await store();
    const body = "agent transcript body";
    const result = await objectStore.put("run-1/transcript.txt", body);
    expect(result.sha256).toBe(sha256Hex(body));
    expect(result.uri).toContain("transcript.txt");
    const stored = await readFile(join(root, "run-1/transcript.txt"));
    expect(stored.toString()).toBe(body);
  });

  it("verifies matching hashes", async () => {
    const objectStore = await store();
    const body = "tool output";
    const { sha256 } = await objectStore.put("run-1/tool.out", body);
    await expect(objectStore.verify("run-1/tool.out", sha256)).resolves.toBe(true);
  });

  it("fails closed on object/hash mismatch", async () => {
    const objectStore = await store();
    await objectStore.put("run-1/blob.bin", "original");
    await writeFile(join(root, "run-1/blob.bin"), "tampered");
    await expect(objectStore.verify("run-1/blob.bin", sha256Hex("original"))).rejects.toBeInstanceOf(HashMismatchError);
  });
});
