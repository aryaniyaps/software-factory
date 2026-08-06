import { redactValue, sanitizeAttributes } from "../telemetry/attributes.js";

export type RedactionLevel = "none" | "secrets" | "pii";

const SECRET_PATTERN = /(secret|token|password|api[_-]?key|credential|authorization|bearer|cookie)/i;
const PII_PATTERN = /(email|phone|ssn|address|name|user_id|customer)/i;

export function redactPayload(value: unknown, level: RedactionLevel): unknown {
  if (level === "none") return sanitizeValue(value, level);
  return sanitizeValue(value, level);
}

function sanitizeValue(value: unknown, level: RedactionLevel): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, level));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      sanitized[key] = sanitizeField(key, child, level);
    }
    return sanitized;
  }
  return value;
}

function sanitizeField(key: string, value: unknown, level: RedactionLevel): unknown {
  if (level === "secrets" || level === "pii") {
    if (SECRET_PATTERN.test(key)) return "[REDACTED]";
    if (level === "pii" && PII_PATTERN.test(key)) return "[REDACTED]";
  }
  if (typeof value === "string" && /(transcript|stdout|stderr|body|content|prompt|message)/i.test(key)) {
    return redactValue(key, value);
  }
  if (typeof value === "object" && value !== null) return sanitizeValue(value, level);
  return redactValue(key, value);
}

export function redactRecord<T extends Record<string, unknown>>(record: T, level: RedactionLevel): T {
  return sanitizeAttributes(record as Record<string, unknown>) as T;
}
