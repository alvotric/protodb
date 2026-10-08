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

export type ScriptTransactionMode = "transaction" | "autocommit";

export interface ScriptStatementResult {
  index: number;
  preview: string;
  command: string;
  rowCount: number | null;
  durationMs: number;
}

export interface ScriptSuccess {
  ok: true;
  kind: "script";
  totalStatements: number;
  executedStatements: number;
  transactionMode: ScriptTransactionMode;
  results: ScriptStatementResult[];
  durationMs: number;
}

export interface ScriptFailure {
  ok: false;
  kind: "script";
  totalStatements: number;
  executedStatements: number;
  failedStatement: number | null;
  failedPreview?: string;
  message: string;
  code?: string;
  position?: number;
  location?: { offset: number; line: number; column: number };
  transactionMode: ScriptTransactionMode;
  results: ScriptStatementResult[];
  durationMs: number;
}

export type ScriptOutcome = ScriptSuccess | ScriptFailure;

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
  if (candidate.kind === "script") return false;
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

export function isScriptOutcome(value: unknown): value is ScriptOutcome {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "script") return false;
  return typeof candidate.totalStatements === "number" &&
    typeof candidate.executedStatements === "number" &&
    Array.isArray(candidate.results) &&
    typeof candidate.durationMs === "number" &&
    (candidate.transactionMode === "transaction" || candidate.transactionMode === "autocommit");
}
