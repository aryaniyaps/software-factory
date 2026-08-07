import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePollingOptions {
  intervalMs: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
}

export function usePolling(
  callback: () => void | Promise<void>,
  { intervalMs, enabled = true, pauseWhenHidden = true }: UsePollingOptions,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  useEffect(() => {
    if (!pauseWhenHidden) return;
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pauseWhenHidden]);

  const tick = useCallback(async () => {
    try {
      await callbackRef.current();
    } catch {
      // polling errors surface in component state
    }
  }, []);

  useEffect(() => {
    if (!enabled || (pauseWhenHidden && !visible)) return;

    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, visible, intervalMs, pauseWhenHidden, tick]);
}

export function useVisibility(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return visible;
}
