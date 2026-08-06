import { describe, expect, it } from "vitest";
import { buildContextPacket } from "../../src/agents/context-packet.js";
import { compactError } from "../../src/agents/compact-error.js";

describe("context packet assembler", () => {
  it("packs structured sections with role mission and task", () => {
    const packet = buildContextPacket({
      role: "scout",
      payload: { ticket: "FACT-1", title: "Add feature" },
      memoryContext: "prior convention: use vitest",
    });
    expect(packet).toContain("<role_mission>");
    expect(packet).toContain("<task>");
    expect(packet).toContain("FACT-1");
    expect(packet).toContain("<memory>");
    expect(packet).toContain("agent-output.v1");
  });

  it("includes compacted errors and evidence hints", () => {
    const packet = buildContextPacket({
      role: "repair",
      payload: { mode: "diagnostic" },
      errors: [compactError(new Error("test failed"), { command: "npm test" })],
      evidenceRefs: ["ev-check-1", "ev-diff-2"],
    });
    expect(packet).toContain("<errors>");
    expect(packet).toContain("test failed");
    expect(packet).toContain("<evidence_hints>");
    expect(packet).toContain("ev-check-1");
  });

  it("respects per-role context budget", () => {
    const packet = buildContextPacket({
      role: "scout",
      payload: { blob: "x".repeat(100_000) },
    });
    expect(packet.length).toBeLessThanOrEqual(32_000);
    expect(packet).toContain("truncated");
  });
});
