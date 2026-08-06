import { describe, expect, it } from "vitest";
import {
  RELEASE_STATES,
  canPromote,
  isLegalTransition,
  transition,
} from "../../src/release/states.js";

describe("release state machine", () => {
  it("defines the canonical release states", () => {
    expect(RELEASE_STATES).toEqual([
      "built",
      "provenance_verified",
      "preview",
      "release_verified",
      "canary",
      "observing",
      "promoted",
      "rolling_back",
      "rolled_back",
      "abstained",
    ]);
  });

  it("follows the built to canary happy path", () => {
    expect(transition("built", "provenance_passed")).toBe("provenance_verified");
    expect(transition("provenance_verified", "preview_deployed")).toBe("preview");
    expect(transition("preview", "release_verified")).toBe("release_verified");
    expect(transition("release_verified", "canary_deployed")).toBe("canary");
    expect(transition("canary", "observation_started")).toBe("observing");
    expect(transition("observing", "promotion_completed")).toBe("promoted");
  });

  it("rolls back from canary or observing on observation failure", () => {
    expect(transition("canary", "observation_failed")).toBe("rolling_back");
    expect(transition("observing", "observation_failed")).toBe("rolling_back");
    expect(transition("rolling_back", "rollback_completed")).toBe("rolled_back");
  });

  it("rejects illegal transitions", () => {
    expect(isLegalTransition("built", "promotion_completed")).toBe(false);
    expect(isLegalTransition("promoted", "canary_deployed")).toBe(false);
    expect(isLegalTransition("rolled_back", "preview_deployed")).toBe(false);
    expect(transition("built", "promotion_completed")).toBeNull();
  });

  it("allows abstention from assurance states before promotion", () => {
    for (const state of ["built", "provenance_verified", "preview", "release_verified", "canary", "observing"] as const) {
      expect(transition(state, "abstain")).toBe("abstained");
    }
  });

  it("cannot promote without completing observation", () => {
    expect(canPromote("canary", { decision: "pass", reasons: [] })).toBe(false);
    expect(canPromote("observing", { decision: "fail", reasons: ["slo"] })).toBe(false);
    expect(canPromote("observing", { decision: "pass", reasons: [] })).toBe(true);
    expect(canPromote("promoted", { decision: "pass", reasons: [] })).toBe(false);
  });
});
