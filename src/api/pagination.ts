export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export interface PageResult<T> {
  readonly schemaVersion: "page.v1";
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function parsePageRequest(query: Record<string, unknown>): PageRequest {
  const rawLimit = Number(query.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.floor(rawLimit)), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const cursor = typeof query.cursor === "string" && query.cursor.length > 0 ? query.cursor : undefined;
  return { limit, cursor };
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const offset = Number(decoded);
  if (!Number.isInteger(offset) || offset < 0) throw new Error("invalid pagination cursor");
  return offset;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function paginate<T>(items: readonly T[], request: PageRequest): PageResult<T> {
  const offset = decodeCursor(request.cursor);
  const slice = items.slice(offset, offset + request.limit);
  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < items.length;
  return {
    schemaVersion: "page.v1",
    items: slice,
    hasMore,
    nextCursor: hasMore ? encodeCursor(nextOffset) : undefined,
  };
}
