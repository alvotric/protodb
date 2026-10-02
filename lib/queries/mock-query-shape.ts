export interface MockQueryTail {
  whereColumn: string | null;
  whereStringValue: string | null;
  whereNumberValue: string | null;
  limit: string | null;
}

const SUPPORTED_REST_PATTERN =
  /^\s*(?:where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?))\s*)?(?:limit\s+(\d+)\s*)?$/i;

export function parseMockQueryTail(rest: string): MockQueryTail | null {
  const match = rest.match(SUPPORTED_REST_PATTERN);
  if (!match) return null;
  return {
    whereColumn: match[1] ?? null,
    whereStringValue: match[2] ?? null,
    whereNumberValue: match[3] ?? null,
    limit: match[4] ?? null,
  };
}
