import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";

describe("application Postgres boundary", () => {
  it("contains only GitHub installation and A2A task state", () => {
    expect(Object.keys(schema).sort()).toEqual(["a2aTasks", "githubInstallations"]);
  });
});
