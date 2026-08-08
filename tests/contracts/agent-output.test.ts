import { describe, expect, it } from "vitest";
import { parseAgentOutput } from "../../src/contracts/nodes.js";

describe("parseAgentOutput", () => {
  it("fills evidenceRefs for abstained review with empty refs", () => {
    const output = parseAgentOutput({
      schemaVersion: "agent-output.v1",
      role: "review",
      status: "abstained",
      summary: "Evidence stubs unavailable",
      evidenceRefs: [],
      data: { approved: false },
    });
    expect(output.role).toBe("review");
    expect(output.status).toBe("abstained");
    expect(output.evidenceRefs).toEqual(["evidence://abstained"]);
  });

  it("accepts valid implement output unchanged", () => {
    const output = parseAgentOutput({
      schemaVersion: "agent-output.v1",
      role: "implement",
      status: "succeeded",
      summary: "Implemented ISBN search",
      evidenceRefs: ["ev-implement-1"],
      data: { filesChanged: ["books/openlibrary.go"] },
    });
    expect(output.evidenceRefs).toEqual(["ev-implement-1"]);
  });
});
