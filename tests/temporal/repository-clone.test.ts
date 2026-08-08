import { describe, expect, it } from "vitest";
import { authenticatedGitHubCloneUrl } from "../../src/temporal/production-worker.js";

describe("authenticatedGitHubCloneUrl", () => {
  it("embeds installation tokens using the x-access-token username", () => {
    const url = authenticatedGitHubCloneUrl("https://github.com/acme/app.git", "ghs_test_token");
    expect(url).toBe("https://x-access-token:ghs_test_token@github.com/acme/app.git");
  });
});
