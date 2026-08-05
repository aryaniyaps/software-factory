import { describe, expect, it, vi } from "vitest";
import { LiteLLMClient } from "../../src/integrations/litellm.js";

describe("LiteLLMClient", () => {
  it("adds factory correlation metadata to model requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    const client = new LiteLLMClient("http://litellm.test", "key");
    await client.complete({ model: "factory/default", messages: [{ role: "user", content: "hello" }], metadata: { factoryRunId: "run-1", ticketId: "ticket-1", attemptId: "attempt-1", phaseId: "scout" } });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.metadata).toMatchObject({ factoryRunId: "run-1", ticketId: "ticket-1" });
    fetchMock.mockRestore();
  });
});
