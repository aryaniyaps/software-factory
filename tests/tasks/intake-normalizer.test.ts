import { describe, expect, it } from "vitest";
import {
  normalizeRepositoryRef,
  normalizeTaskIntake,
  RepositoryRequiredError,
  repositoryFullName,
} from "../../src/tasks/intake-normalizer.js";

describe("task intake normalizer", () => {
  it("infers task fields from one free-form prompt when repository is explicit", () => {
    expect(normalizeTaskIntake({
      prompt: "Add durable clarification\n\nAgents should ask focused questions.",
      repository: "acme/app",
    })).toEqual({
      prompt: "Add durable clarification\n\nAgents should ask focused questions.",
      repository: "https://github.com/acme/app.git",
      title: "Add durable clarification",
      description: "Add durable clarification\n\nAgents should ask focused questions.",
    });
  });

  it("normalizes owner/repo and https clone URLs", () => {
    expect(normalizeRepositoryRef("acme/app")).toBe("https://github.com/acme/app.git");
    expect(normalizeRepositoryRef("https://github.com/acme/app")).toBe("https://github.com/acme/app.git");
    expect(repositoryFullName("https://github.com/acme/app.git")).toBe("acme/app");
  });

  it("fails closed when repository is missing", () => {
    expect(() => normalizeTaskIntake({ prompt: "Build it" }, {})).toThrow(RepositoryRequiredError);
  });
});
