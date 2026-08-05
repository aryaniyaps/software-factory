export class HealthChecker {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async wait(url: string, options: { attempts?: number; timeoutMs?: number; intervalMs?: number } = {}): Promise<void> {
    const attempts = options.attempts ?? 5;
    const timeoutMs = options.timeoutMs ?? 5_000;
    const intervalMs = options.intervalMs ?? 1_000;
    let lastError = "health check failed";
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await this.fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (response.ok) return;
        lastError = `health check returned ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt + 1 < attempts && intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(lastError);
  }
}
