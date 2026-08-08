import { describe, expect, it } from "vitest";
import {
  FACTORY_RETENTION_DAYS,
  FACTORY_SEARCH_ATTRIBUTES,
  namespacePolicyRequest,
} from "../../src/temporal/search-attributes.js";

describe("Temporal namespace policy", () => {
  it("requires the execution contract search attribute and 90-day retention", () => {
    expect(FACTORY_SEARCH_ATTRIBUTES).toContainEqual(["FactoryExecutionContract", "Keyword"]);
    expect(FACTORY_RETENTION_DAYS).toBe(90);
    const request = namespacePolicyRequest("factory");
    expect(request.namespace).toBe("factory");
    expect(request.config?.workflowExecutionRetentionTtl?.seconds?.toString()).toBe("7776000");
  });
});
