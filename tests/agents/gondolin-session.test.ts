import { describe, expect, it } from "vitest";
import { gondolinExtensionPath } from "../../src/agents/gondolin-session.js";

describe("Gondolin session configuration", () => {
  it("uses the configured official Pi extension path", () => {
    expect(gondolinExtensionPath("/factory/worktree")).toBe(
      "/factory/worktree/node_modules/@earendil-works/pi-coding-agent/examples/extensions/gondolin",
    );
  });
});
