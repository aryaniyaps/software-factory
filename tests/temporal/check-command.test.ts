import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCheckCommand, resolvePrimaryLanguage } from "../../src/temporal/activities/check-command.js";

describe("resolveCheckCommand", () => {
  it("prefers go test for Go modules", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sf-go-"));
    await writeFile(join(dir, "go.mod"), "module example.com/test\n\ngo 1.22\n");
    await expect(resolveCheckCommand(dir)).resolves.toEqual({
      command: "go",
      args: ["test", "./...", "-count=1"],
    });
    await expect(resolvePrimaryLanguage(dir)).resolves.toBe("go");
  });

  it("uses npm test for Node projects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sf-node-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "app", scripts: { test: "vitest run" } }));
    await expect(resolveCheckCommand(dir)).resolves.toEqual({
      command: "npm",
      args: ["test", "--", "--run"],
    });
    await expect(resolvePrimaryLanguage(dir)).resolves.toBe("typescript");
  });
});
