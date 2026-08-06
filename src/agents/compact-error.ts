export interface CompactedError {
  readonly type: string;
  readonly message: string;
  readonly path?: string;
  readonly command?: string;
  readonly detail?: string;
}

export function compactError(err: unknown, context?: { path?: string; command?: string }): CompactedError {
  const error = err instanceof Error ? err : new Error(String(err));
  const stackLine = error.stack?.split("\n").find((line) => line.trim().startsWith("at "))?.trim();
  const detail = stackLine ? stackLine.slice(0, 240) : undefined;
  return {
    type: error.name || "Error",
    message: error.message.slice(0, 500),
    ...(context?.path ? { path: context.path } : {}),
    ...(context?.command ? { command: context.command.slice(0, 200) } : {}),
    ...(detail ? { detail } : {}),
  };
}

export function formatCompactedErrors(errors: readonly CompactedError[]): string {
  if (errors.length === 0) return "";
  return errors.map((e) => JSON.stringify(e)).join("\n");
}
