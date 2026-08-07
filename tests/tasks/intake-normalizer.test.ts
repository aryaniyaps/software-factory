import { describe, expect, it } from "vitest";
import { normalizeTaskIntake } from "../../src/tasks/intake-normalizer.js";

describe("task intake normalizer", () => {
  it("infers task fields from one free-form prompt", () => {
    expect(normalizeTaskIntake(
      { prompt: "Add durable clarification\n\nAgents should ask focused questions." },
      { FACTORY_DEFAULT_REPOSITORY: "/repo/app" },
    )).toEqual({
      prompt: "Add durable clarification\n\nAgents should ask focused questions.",
      repository: "/repo/app",
      title: "Add durable clarification",
      description: "Add durable clarification\n\nAgents should ask focused questions.",
    });
  });

  it("prefers an explicit repository URL in the prompt", () => {
    expect(normalizeTaskIntake(
      { prompt: "Update https://github.com/acme/app.git to support A2A." },
      { FACTORY_DEFAULT_REPOSITORY: "/repo/default" },
    ).repository).toBe("https://github.com/acme/app.git");
  });

  it("fails closed when repository context is ambiguous", () => {
    expect(() => normalizeTaskIntake({ prompt: "Build it" }, {})).toThrow(
      /repository could not be inferred/,
    );
  });
});
