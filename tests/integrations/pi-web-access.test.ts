import { describe, expect, it } from "vitest";
import { createPiWebAccessConfig, redactWebResult } from "../../src/integrations/pi-web-access.js";

describe("Pi Web Access", () => {
  it("defaults to all eligible providers with labelled fallback routing", () => {
    expect(createPiWebAccessConfig({})).toMatchObject({ provider: "all", searchRouting: { providers: ["openai", "brave", "exa"] } });
  });

  it("redacts credentials while preserving provider and source attribution", () => {
    expect(redactWebResult({ provider: "brave", url: "https://example.com", apiKey: "secret", authorization: "Bearer secret", title: "Result" })).toEqual({ provider: "brave", url: "https://example.com", title: "Result" });
  });
});
