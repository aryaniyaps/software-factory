import type { CorrelationContext } from "./correlation.js";

export class LiteLLMClient {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}

  async complete(input: { model: string; messages: unknown[]; metadata: CorrelationContext }): Promise<unknown> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: input.model, messages: input.messages, metadata: input.metadata }),
    });
    if (!response.ok) throw new Error(`LiteLLM request failed: ${response.status}`);
    return response.json();
  }
}
