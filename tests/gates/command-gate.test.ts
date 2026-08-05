import { describe, expect, it } from "vitest";
import { commandGate } from "../../src/gates/command-gate.js";

describe("commandGate", () => {
  it("passes a successful command", async () => {
    await expect(commandGate({ command: process.execPath, args: ["-e", "process.stdout.write('ok')"] })).resolves.toMatchObject({ passed: true, stdout: "ok" });
  });

  it("fails a non-zero command", async () => {
    await expect(commandGate({ command: process.execPath, args: ["-e", "process.exit(2)"] })).resolves.toMatchObject({ passed: false, exitCode: 2 });
  });
});
