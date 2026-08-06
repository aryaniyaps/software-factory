import { describe, expect, it } from "vitest";
import { FACTORY_NODE_NAMES } from "../../src/temporal/workflows/types.js";

describe("factory workflow topology", () => {
  it("keeps the graph topology explicit and stable", () => {
    expect(FACTORY_NODE_NAMES).toEqual([
      "prepare_repository",
      "create_worktree",
      "security_scan",
      "scout",
      "plan",
      "implement",
      "deterministic_checks",
      "repair",
      "review",
      "build_artifact",
      "deploy",
      "health_check",
    ]);
  });
});
