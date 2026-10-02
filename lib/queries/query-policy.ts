export const MAX_SQL_BYTES = 100_000;
export const SQL_STATEMENT_TIMEOUT_MS = 10_000;
export const MAX_RESULT_ROWS = 500;
export const MAX_RESULT_BYTES = 1_000_000;
export const QUERY_CONCURRENCY_LIMIT = 3;
export const QUERY_HISTORY_LIMIT = 100;
export const MAX_SAVED_QUERIES = 200;
export const MAX_SAVED_QUERY_NAME_LENGTH = 120;

let activeExecutions = 0;

export class QueryRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "QueryRequestError";
    this.status = status;
  }
}

export function validateSqlText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new QueryRequestError("sql must be a non-empty string.");
  }
  if (Buffer.byteLength(value, "utf8") > MAX_SQL_BYTES) {
    throw new QueryRequestError(`SQL text must not exceed ${MAX_SQL_BYTES} bytes.`);
  }
  return value;
}

export function validateSavedQueryName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new QueryRequestError("name must be a non-empty string.");
  }
  const name = value.trim();
  if (name.length > MAX_SAVED_QUERY_NAME_LENGTH) {
    throw new QueryRequestError(`name must not exceed ${MAX_SAVED_QUERY_NAME_LENGTH} characters.`);
  }
  return name;
}

export function parseSavedQueryPayload(value: unknown): { name: string; sql: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QueryRequestError("Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "name" && key !== "sql")) {
    throw new QueryRequestError("Only the name and sql fields are accepted.");
  }
  return { name: validateSavedQueryName(body.name), sql: validateSqlText(body.sql) };
}

export function parseSavedQueryId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new QueryRequestError("Saved query ID is invalid.");
  }
  return value;
}

export function acquireQuerySlot(): (() => void) | null {
  if (activeExecutions >= QUERY_CONCURRENCY_LIMIT) return null;
  activeExecutions += 1;
  let released = false;
  return () => {
    if (!released) {
      activeExecutions -= 1;
      released = true;
    }
  };
}

export function positionToLocation(sql: string, postgresPosition: unknown): {
  position: number;
  offset: number;
  line: number;
  column: number;
} | null {
  const parsed = typeof postgresPosition === "string" ? Number(postgresPosition) : postgresPosition;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1) return null;

  const codePoints = Array.from(sql);
  const offset = Math.min(parsed - 1, codePoints.length);
  const before = codePoints.slice(0, offset).join("");
  const lines = before.split("\n");
  return {
    position: parsed,
    offset: before.length,
    line: lines.length,
    column: Array.from(lines[lines.length - 1] ?? "").length + 1,
  };
}

export function safePostgresError(error: unknown): { message: string; code?: string; position?: number } {
  const candidate = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const code = typeof candidate.code === "string" ? candidate.code : undefined;
  const position = positionToLocation("", candidate.position)?.position;
  let message = "SQL execution failed.";

  if (code === "57014") message = "The query exceeded the 10-second execution limit or was cancelled.";
  else if (code === "42601") message = "PostgreSQL could not parse the SQL statement.";
  else if (code === "42501") message = "The database role is not permitted to perform this operation.";
  else if (code === "23505" || code?.startsWith("22") || code?.startsWith("23")) {
    message = "PostgreSQL rejected the statement because of a value or constraint violation.";
  } else if (code === "42P01" || code === "42703") {
    message = "A referenced database object was not found or is not accessible.";
  } else if (code === "25001" || code === "25000") {
    message = "This statement is not supported within the SQL Editor's managed transaction.";
  } else if (code?.startsWith("08")) {
    message = "The database connection failed while executing the query.";
  }

  return { message, ...(code ? { code } : {}), ...(position !== undefined ? { position } : {}) };
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new QueryRequestError("Request body is too large.", 413);
  }
  if (!request.body) throw new QueryRequestError("A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new QueryRequestError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new QueryRequestError("Request body must contain valid JSON.");
  }
}
