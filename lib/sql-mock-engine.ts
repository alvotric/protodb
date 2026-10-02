import { tables, tableRows, type TableRowData, type CellValue } from "@/lib/mock-data";
import { parseMockQueryTail } from "@/lib/queries/mock-query-shape";

/**
 * Phase 6 — Advanced SQL Editor & Results.
 *
 * This is only the explicitly labeled offline/demo fallback. It
 * recognizes one simple SELECT shape against mock rows and rejects
 * unsupported SQL rather than presenting simulated results as live.
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
        "This demo only simulates simple SELECT queries with an optional equality WHERE and LIMIT. Live SQL execution requires a configured database.",
      durationMs: elapsed(),
    };
  }

  const [, colsPart, tableName, rest] = match;
  const restMatch = parseMockQueryTail(rest);
  if (!restMatch) {
    return {
      ok: false,
      message: "Demo mode supports only simple SELECT queries with an optional equality WHERE and LIMIT. This SQL was not evaluated.",
      durationMs: elapsed(),
    };
  }
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
  const { whereColumn, whereStringValue, whereNumberValue } = restMatch;
  if (whereColumn && whereStringValue !== null) {
    const col = whereColumn;
    if (!availableColumns.includes(col)) {
      return { ok: false, message: `column "${col}" does not exist`, durationMs: elapsed() };
    }
    const value = whereStringValue.replace(/''/g, "'");
    resultRows = resultRows.filter((r) => String(r[col] ?? "") === value);
  } else if (whereColumn && whereNumberValue !== null) {
    const col = whereColumn;
    if (!availableColumns.includes(col)) {
      return { ok: false, message: `column "${col}" does not exist`, durationMs: elapsed() };
    }
    resultRows = resultRows.filter((r) => String(r[col] ?? "") === whereNumberValue);
  }

  const limit = restMatch.limit;
  if (limit) resultRows = resultRows.slice(0, parseInt(limit, 10));

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
