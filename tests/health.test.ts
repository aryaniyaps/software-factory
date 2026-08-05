import { describe, expect, it } from "vitest";
import { healthCheck } from "../src/health.js";

describe("healthCheck", () => {
  it("returns a stable service health response", () => {
    expect(healthCheck()).toEqual({ status: "ok", service: "software-factory" });
  });
});
