export interface PiWebAccessConfig {
  provider: "all";
  searchRouting: { providers: string[]; fallbackOn: Array<"transient" | "quota" | "network"> };
  webSearch: { enabled: boolean };
}

export function createPiWebAccessConfig(env: Record<string, string | undefined> = process.env): PiWebAccessConfig {
  const providers = (env.PI_WEB_SEARCH_PROVIDERS ?? "openai,brave,exa").split(",").map((provider) => provider.trim()).filter(Boolean);
  return {
    provider: "all",
    searchRouting: { providers, fallbackOn: ["transient", "quota", "network"] },
    webSearch: { enabled: true },
  };
}

export function redactWebResult(result: Record<string, unknown>): Record<string, unknown> {
  const { apiKey: _apiKey, authorization: _authorization, token: _token, ...safe } = result;
  return safe;
}
