import { tables, tableRows, type TableRowData, type CellValue } from "@/lib/mock-data";

/**
 * Phase 6 — Advanced SQL Editor & Results.
 *
 * No real database exists until Phase 10, so this doesn't pretend to
 * be one -- it recognizes one shape (`SELECT <cols> FROM <table>
 * [WHERE col = value] [LIMIT n]`) against the real mock row data
 * already in lib/mock-data.ts, and returns a clear, specific error for
 * anything else (unknown table, unknown column, or a query shape this
 * doesn't parse) rather than a fabricated result. That's the honest
 * boundary of what a UI-only phase can simulate; full SQL execution
 * is explicitly Phase 10's job.
 */
export interface QuerySuccess {
  ok: true;
  columns: string[];
  rows: TableRowData[];
  rowCount: number;
  durationMs: number;
}

export interface QueryFailure {
  ok: false;
  message: string;
  position?: number;
  durationMs: number;
}

export type QueryOutcome = QuerySuccess | QueryFailure;

const SELECT_PATTERN = /^select\s+(.+?)\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)\b(.*)$/is;
const WHERE_STRING_PATTERN = /where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*'([^']*)'/i;
const WHERE_NUMBER_PATTERN = /where\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)/i;
const LIMIT_PATTERN = /limit\s+(\d+)/i;

export async function runMockQuery(sqlRaw: string): Promise<QueryOutcome> {
  const start = performance.now();
  // A short, jittered delay so "execution time" reads like it came
  // from somewhere real rather than resolving instantly every time.
  await new Promise((resolve) => setTimeout(resolve, 180 + Math.random() * 260));

  const sql = sqlRaw.trim().replace(/;+\s*$/, "");
  const elapsed = () => Math.round(performance.now() - start);

  if (!sql) {
    return { ok: false, message: "Nothing to run.", durationMs: elapsed() };
  }

  const match = sql.match(SELECT_PATTERN);
  if (!match) {
    return {
      ok: false,
      message:
        "This preview only simulates simple `SELECT <columns> FROM <table>` queries (optionally with WHERE col = value and LIMIT n). Full SQL execution -- joins, writes, DDL -- arrives in Phase 10.",
      durationMs: elapsed(),
    };
  }

  const [, colsPart, tableName, rest] = match;
  const table = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
  if (!table) {
    const position = sql.toLowerCase().indexOf(tableName.toLowerCase());
    return { ok: false, message: `relation "${tableName}" does not exist`, position, durationMs: elapsed() };
  }

  const sourceRows = tableRows[table.name];
  if (!sourceRows) {
    return {
      ok: false,
      message: `"${table.name}" exists but has no row-level mock data in this preview -- only "users" and "products" do.`,
      durationMs: elapsed(),
    };
  }

  const availableColumns = Object.keys(sourceRows[0] ?? {});
  let columns: string[];
  if (colsPart.trim() === "*") {
    columns = availableColumns;
  } else {
    columns = colsPart.split(",").map((c) => c.trim());
    const unknown = columns.find((c) => !availableColumns.includes(c));
    if (unknown) {
      const position = sql.toLowerCase().indexOf(unknown.toLowerCase());
      return { ok: false, message: `column "${unknown}" does not exist`, position, durationMs: elapsed() };
    }
  }

  let resultRows = sourceRows;
  const whereStr = rest.match(WHERE_STRING_PATTERN);
  const whereNum = rest.match(WHERE_NUMBER_PATTERN);
  if (whereStr) {
    const [, col, value] = whereStr;
    if (!availableColumns.includes(col)) {
      return { ok: false, message: `column "${col}" does not exist`, durationMs: elapsed() };
    }
    resultRows = resultRows.filter((r) => String(r[col] ?? "") === value);
  } else if (whereNum) {
    const [, col, value] = whereNum;
    if (!availableColumns.includes(col)) {
      return { ok: false, message: `column "${col}" does not exist`, durationMs: elapsed() };
    }
    resultRows = resultRows.filter((r) => String(r[col] ?? "") === value);
  }

  const limitMatch = rest.match(LIMIT_PATTERN);
  if (limitMatch) resultRows = resultRows.slice(0, parseInt(limitMatch[1], 10));

  const projected: TableRowData[] =
    columns.length === availableColumns.length
      ? resultRows
      : resultRows.map((row) => {
          const out: Record<string, CellValue> = {};
          for (const c of columns) out[c] = row[c];
          return out;
        });

  return { ok: true, columns, rows: projected, rowCount: projected.length, durationMs: elapsed() };
}
