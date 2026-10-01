import { getPool, query, queryOne } from "@/lib/db/client";
import { quoteIdent, quoteQualifiedTable } from "@/lib/db/identifier";
import { getTableColumns } from "@/lib/database/schema-service";

const MAX_PAGE_SIZE = 200;

export interface TableRowsResult {
  columns: string[];
  rows: Record<string, unknown>[];
  totalCount: number;
}

/**
 * Phase 10 — Backend API & Real Data Integration (Part 2).
 *
 * The real backing for Table View (Phase 4). Every function here
 * re-fetches the table's real columns first and checks any
 * caller-supplied column name against that list before it's ever
 * quoted into SQL as an identifier -- `quoteIdent()`'s character
 * check is the first line of defense, this is the second: a column
 * name can be syntactically valid and still not be a real column on
 * this table, and this refuses those too rather than letting Postgres
 * itself be the one to reject an invalid identifier.
 *
 * Values (as opposed to identifiers) are always sent as real
 * parameterized query arguments ($1, $2, ...), never interpolated --
 * standard SQL-injection-safe practice for anything that isn't an
 * identifier.
 */
export async function getTableRows(
  schema: string,
  table: string,
  options: {
    page: number;
    pageSize: number;
    sortColumn?: string;
    sortDir?: "asc" | "desc";
    filterColumn?: string;
    filterValue?: string;
  }
): Promise<TableRowsResult> {
  const columns = await getTableColumns(schema, table);
  const columnNames = new Set(columns.map((c) => c.name));
  const qualified = quoteQualifiedTable(schema, table);

  let whereClause = "";
  const params: unknown[] = [];
  if (options.filterColumn && columnNames.has(options.filterColumn) && options.filterValue) {
    whereClause = `where ${quoteIdent(options.filterColumn, "column")}::text ilike $1`;
    params.push(`%${options.filterValue}%`);
  }

  let orderClause = "";
  if (options.sortColumn && columnNames.has(options.sortColumn)) {
    const dir = options.sortDir === "desc" ? "desc" : "asc";
    orderClause = `order by ${quoteIdent(options.sortColumn, "column")} ${dir}`;
  }

  const limit = Math.min(Math.max(Math.floor(options.pageSize) || 25, 1), MAX_PAGE_SIZE);
  const offset = Math.max(Math.floor(options.page) || 0, 0) * limit;

  const [rows, countRow] = await Promise.all([
    query<Record<string, unknown>>(
      `select * from ${qualified} ${whereClause} ${orderClause} limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    queryOne<{ count: string }>(`select count(*)::text as count from ${qualified} ${whereClause}`, params),
  ]);

  return {
    columns: columns.map((c) => c.name),
    rows,
    totalCount: countRow ? parseInt(countRow.count, 10) : 0,
  };
}

export async function updateTableRow(
  schema: string,
  table: string,
  primaryKeyColumn: string,
  primaryKeyValue: unknown,
  changes: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const columns = await getTableColumns(schema, table);
  const columnNames = new Set(columns.map((c) => c.name));
  if (!columnNames.has(primaryKeyColumn)) throw new Error(`"${primaryKeyColumn}" is not a real column on this table.`);

  const entries = Object.entries(changes).filter(([key]) => columnNames.has(key) && key !== primaryKeyColumn);
  if (entries.length === 0) return null;

  const qualified = quoteQualifiedTable(schema, table);
  const setClauses = entries.map(([key], i) => `${quoteIdent(key, "column")} = $${i + 1}`).join(", ");
  const values = entries.map(([, value]) => value);

  return queryOne<Record<string, unknown>>(
    `update ${qualified} set ${setClauses} where ${quoteIdent(primaryKeyColumn, "column")} = $${values.length + 1} returning *`,
    [...values, primaryKeyValue]
  );
}

export async function insertTableRow(
  schema: string,
  table: string,
  values: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const columns = await getTableColumns(schema, table);
  const columnNames = new Set(columns.map((c) => c.name));

  const entries = Object.entries(values).filter(([key]) => columnNames.has(key));
  if (entries.length === 0) {
    // Every column omitted (or invalid) -- fall back to an all-default
    // insert rather than silently doing nothing, so "Add row" still
    // creates something on a table with no editable-looking columns.
    const qualified = quoteQualifiedTable(schema, table);
    return queryOne<Record<string, unknown>>(`insert into ${qualified} default values returning *`);
  }

  const qualified = quoteQualifiedTable(schema, table);
  const colList = entries.map(([key]) => quoteIdent(key, "column")).join(", ");
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
  const vals = entries.map(([, v]) => v);

  return queryOne<Record<string, unknown>>(`insert into ${qualified} (${colList}) values (${placeholders}) returning *`, vals);
}

export async function deleteTableRows(
  schema: string,
  table: string,
  primaryKeyColumn: string,
  primaryKeyValues: unknown[]
): Promise<number> {
  if (primaryKeyValues.length === 0) return 0;

  const columns = await getTableColumns(schema, table);
  const columnNames = new Set(columns.map((c) => c.name));
  if (!columnNames.has(primaryKeyColumn)) throw new Error(`"${primaryKeyColumn}" is not a real column on this table.`);

  const qualified = quoteQualifiedTable(schema, table);
  const placeholders = primaryKeyValues.map((_, i) => `$${i + 1}`).join(", ");

  const result = await getPool().query(
    `delete from ${qualified} where ${quoteIdent(primaryKeyColumn, "column")} in (${placeholders})`,
    primaryKeyValues
  );
  return result.rowCount ?? 0;
}
