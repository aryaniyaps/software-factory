import { describe, expect, it } from "vitest";
import { securityGate } from "../../src/gates/security-gate.js";

describe("securityGate", () => {
  it("flags private keys and credential files", async () => {
    const result = await securityGate({ files: [".env", "src/key.pem", "README.md"] });
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining(["credential file: .env", "private key: src/key.pem"]));
  });

  it("passes ordinary source files", async () => {
    await expect(securityGate({ files: ["src/index.ts", "package.json"] })).resolves.toEqual({ passed: true, findings: [] });
  });
});
