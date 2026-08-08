import { Context } from "@temporalio/activity";

const DEFAULT_INTERVAL_MS = 20_000;

/**
 * Heartbeat from a captured activity Context so timers keep working even if
 * AsyncLocalStorage is disrupted by OpenTelemetry spans or other ALS nesting.
 */
export function startActivityHeartbeat(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  let ctx: Context | undefined;
  try {
    ctx = Context.current();
  } catch {
    // Outside Temporal activity context (unit tests).
    return () => undefined;
  }

  const beat = () => {
    try {
      ctx.heartbeat();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Cancellation is expected when the activity is cancelled/timed out.
      if (/cancel/i.test(message)) return;
      console.warn(`[activity-heartbeat] heartbeat failed: ${message}`);
    }
  };

  beat(); // immediate proof-of-life
  const timer = setInterval(beat, intervalMs);
  return () => clearInterval(timer);
}
