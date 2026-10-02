export interface QuerySuccess {
  ok: true;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
}

export interface QueryFailure {
  ok: false;
  message: string;
  code?: string;
  position?: number;
  location?: { offset: number; line: number; column: number };
  durationMs: number;
}

export type QueryOutcome = QuerySuccess | QueryFailure;

export interface QueryHistoryRecord {
  id: string;
  sql: string;
  status: "success" | "error";
  rows: number | null;
  durationMs: number;
  error: string | null;
  errorPosition: number | null;
  ranAt: string;
}

export function isQueryOutcome(value: unknown): value is QueryOutcome {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.ok === false) {
    return typeof candidate.message === "string" && typeof candidate.durationMs === "number";
  }
  return candidate.ok === true &&
    Array.isArray(candidate.columns) && candidate.columns.every((column) => typeof column === "string") &&
    Array.isArray(candidate.rows) &&
    typeof candidate.rowCount === "number" &&
    typeof candidate.durationMs === "number" &&
    typeof candidate.truncated === "boolean";
}
