import { getPool, query, queryOne } from "@/lib/db/client";
import { quoteIdent, quoteQualifiedTable } from "@/lib/db/identifier";
import { getTableColumns, type RealColumn } from "@/lib/database/schema-service";

const MAX_PAGE_SIZE = 200;

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type TableFilterOperator = "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "is_null" | "not_null";

export interface TableFilter {
  column: string;
  operator: TableFilterOperator;
  value?: unknown;
}

export class TableDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableDataValidationError";
  }
}

export interface TableRowsResult {
  columns: string[];
  rows: Record<string, unknown>[];
  totalCount: number;
}

function parseColumnValue(column: RealColumn, value: unknown): unknown {
  if (value === null) {
    if (!column.nullable) throw new TableDataValidationError(`"${column.name}" cannot be NULL.`);
    return null;
  }

  const type = column.type.toLowerCase();
  const text = typeof value === "string" ? value : null;
  const isNumber = typeof value === "number" && Number.isFinite(value);

  if (["smallint", "integer", "bigint"].includes(type)) {
    if ((!isNumber || !Number.isSafeInteger(value)) && !(text && /^[-+]?\d+$/.test(text))) {
      throw new TableDataValidationError(`"${column.name}" must be a whole number.`);
    }
    const normalized = String(value);
    let integer: bigint;
    try {
      integer = BigInt(normalized);
    } catch {
      throw new TableDataValidationError(`"${column.name}" must be a whole number.`);
    }
    const bounds: Record<string, [bigint, bigint]> = {
      smallint: [-32768n, 32767n],
      integer: [-2147483648n, 2147483647n],
      bigint: [-9223372036854775808n, 9223372036854775807n],
    };
    const [minimum, maximum] = bounds[type];
    if (integer < minimum || integer > maximum) {
      throw new TableDataValidationError(`"${column.name}" is outside the range for ${type}.`);
    }
    return normalized;
  }
  if (["numeric", "decimal", "real", "double precision"].includes(type)) {
    if ((!isNumber && !(text && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(text))) ||
        (type !== "numeric" && type !== "decimal" && !Number.isFinite(Number(value)))) {
      throw new TableDataValidationError(`"${column.name}" must be a valid number.`);
    }
    return String(value);
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (text === "true" || text === "false") return text === "true";
    throw new TableDataValidationError(`"${column.name}" must be true or false.`);
  }
  if (type === "date") {
    if (!text || !isValidCalendarDate(text)) {
      throw new TableDataValidationError(`"${column.name}" must be a valid date.`);
    }
    return text;
  }
  if (["time without time zone", "time with time zone"].includes(type)) {
    if (!text || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/i.test(text)) {
      throw new TableDataValidationError(`"${column.name}" must be a valid time.`);
    }
    return text;
  }
  if (["timestamp without time zone", "timestamp with time zone"].includes(type)) {
    const datePart = text?.slice(0, 10);
    if (
      !text ||
      !isValidCalendarDate(datePart ?? "") ||
      !/^[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?/.test(text.slice(10)) ||
      Number.isNaN(Date.parse(text))
    ) {
      throw new TableDataValidationError(`"${column.name}" must be a valid date and time.`);
    }
    return text;
  }
  if (type === "json" || type === "jsonb") {
    if (typeof value !== "string") return JSON.stringify(value);
    try {
      JSON.parse(value);
    } catch {
      throw new TableDataValidationError(`"${column.name}" must contain valid JSON.`);
    }
    return value;
  }
  if (type === "uuid") {
    if (!text || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
      throw new TableDataValidationError(`"${column.name}" must be a valid UUID.`);
    }
    return text;
  }
  if (typeof value !== "string") {
    throw new TableDataValidationError(`"${column.name}" must be text.`);
  }
  return value;
}

function requireSinglePrimaryKey(columns: RealColumn[], primaryKeyColumn: string): RealColumn {
  const keys = columns.filter((column) => column.isPrimaryKey);
  if (keys.length !== 1 || keys[0].name !== primaryKeyColumn) {
    throw new TableDataValidationError("Row editing requires a table with a single-column primary key.");
  }
  return keys[0];
}

function buildWhereClause(
  columns: RealColumn[],
  filters: TableFilter[],
  params: unknown[]
): string {
  if (!Array.isArray(filters) || filters.length > 20) {
    throw new TableDataValidationError("Provide no more than 20 filter clauses.");
  }
  const columnMap = new Map(columns.map((column) => [column.name, column]));
  const clauses: string[] = [];

  for (const filter of filters) {
    if (!filter || typeof filter !== "object" || typeof filter.column !== "string" || typeof filter.operator !== "string") {
      throw new TableDataValidationError("Each filter must include a column and operator.");
    }
    const column = columnMap.get(filter.column);
    if (!column) throw new TableDataValidationError(`"${filter.column}" is not a real column on this table.`);
    const identifier = quoteIdent(column.name, "column");

    if (filter.operator === "is_null") {
      clauses.push(`${identifier} is null`);
      continue;
    }
    if (filter.operator === "not_null") {
      clauses.push(`${identifier} is not null`);
      continue;
    }
    if (!["eq", "neq", "contains", "gt", "gte", "lt", "lte"].includes(filter.operator)) {
      throw new TableDataValidationError("Unsupported filter operator.");
    }
    if (filter.value === undefined) throw new TableDataValidationError("A filter value is required.");
    if (filter.value === null) throw new TableDataValidationError("Use IS NULL or IS NOT NULL to filter NULL values.");
    const type = column.type.toLowerCase();
    if (filter.operator === "contains" && !["text", "character varying", "character", "json", "jsonb"].includes(type)) {
      throw new TableDataValidationError(`Contains filtering is not supported for "${column.name}".`);
    }
    if (filter.operator === "contains" && typeof filter.value !== "string") {
      throw new TableDataValidationError("Contains filters require text.");
    }
    if (["gt", "gte", "lt", "lte"].includes(filter.operator) &&
        !["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision", "date"].includes(type) &&
        !type.startsWith("timestamp ") && !type.startsWith("time ")) {
      throw new TableDataValidationError(`Range filtering is not supported for "${column.name}".`);
    }
    if (type === "json" && ["eq", "neq"].includes(filter.operator)) {
      throw new TableDataValidationError(`Equality filtering is not supported for "${column.name}".`);
    }
    const value = filter.operator === "contains" ? filter.value as string : parseColumnValue(column, filter.value);
    const placeholder = `$${params.length + 1}`;
    params.push(filter.operator === "contains" ? `%${(value as string).replace(/[\\%_]/g, "\\$&")}%` : value);
    const sqlOperator: Record<Exclude<TableFilterOperator, "is_null" | "not_null">, string> = {
      eq: "=",
      neq: "<>",
      contains: "ilike",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
    };
    const comparison = filter.operator === "contains" && ["json", "jsonb"].includes(type)
      ? `${identifier}::text`
      : identifier;
    clauses.push(`${comparison} ${sqlOperator[filter.operator]} ${placeholder}`);
  }
  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

/**
 * Real table data access for Phase 4. Identifiers are checked against
 * live table metadata and quoted; every supplied value is parameterized.
 */
export async function getTableRows(
  schema: string,
  table: string,
  options: {
    page: number;
    pageSize: number;
    sortColumn?: string;
    sortDir?: "asc" | "desc";
    filters?: TableFilter[];
    filterColumn?: string;
    filterValue?: string;
  }
): Promise<TableRowsResult> {
  const columns = await getTableColumns(schema, table);
  const columnNames = new Set(columns.map((column) => column.name));
  const qualified = quoteQualifiedTable(schema, table);
  const params: unknown[] = [];
  const filters = options.filters ?? (
    options.filterColumn && options.filterValue !== undefined
      ? [{ column: options.filterColumn, operator: "contains" as const, value: options.filterValue }]
      : []
  );
  const whereClause = buildWhereClause(columns, filters, params);

  let orderClause = "";
  if (options.sortColumn) {
    if (!columnNames.has(options.sortColumn)) {
      throw new TableDataValidationError(`"${options.sortColumn}" is not a real column on this table.`);
    }
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
    columns: columns.map((column) => column.name),
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
  const columnMap = new Map(columns.map((column) => [column.name, column]));
  const primaryKey = columnMap.get(primaryKeyColumn);
  if (!primaryKey) throw new TableDataValidationError(`"${primaryKeyColumn}" is not a real column on this table.`);
  requireSinglePrimaryKey(columns, primaryKeyColumn);
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new TableDataValidationError("Changes must be an object.");
  }

  const entries = Object.entries(changes);
  for (const [name] of entries) {
    const column = columnMap.get(name);
    if (!column) throw new TableDataValidationError(`"${name}" is not a real column on this table.`);
    if (name === primaryKeyColumn) throw new TableDataValidationError("Primary key values cannot be edited.");
    if (column.isGenerated) throw new TableDataValidationError(`"${name}" is generated by the database and cannot be edited.`);
  }
  if (entries.length === 0) throw new TableDataValidationError("At least one column change is required.");

  const values = entries.map(([name, value]) => parseColumnValue(columnMap.get(name)!, value));
  const parsedKey = parseColumnValue(primaryKey, primaryKeyValue);
  const qualified = quoteQualifiedTable(schema, table);
  const setClauses = entries.map(([name], index) => `${quoteIdent(name, "column")} = $${index + 1}`).join(", ");

  return queryOne<Record<string, unknown>>(
    `update ${qualified} set ${setClauses} where ${quoteIdent(primaryKeyColumn, "column")} = $${values.length + 1} returning *`,
    [...values, parsedKey]
  );
}

export async function insertTableRow(
  schema: string,
  table: string,
  values: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const columns = await getTableColumns(schema, table);
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new TableDataValidationError("Row values must be an object.");
  }
  const columnMap = new Map(columns.map((column) => [column.name, column]));
  const entries = Object.entries(values);
  for (const [name] of entries) {
    const column = columnMap.get(name);
    if (!column) throw new TableDataValidationError(`"${name}" is not a real column on this table.`);
    if (column.isGenerated) throw new TableDataValidationError(`"${name}" is generated by the database and cannot be set.`);
  }
  const suppliedColumns = new Set(entries.map(([name]) => name));
  const missingRequired = columns.find(
    (column) =>
      !column.nullable &&
      column.default === null &&
      !column.isIdentity &&
      !column.isGenerated &&
      !suppliedColumns.has(column.name)
  );
  if (missingRequired) {
    throw new TableDataValidationError(`"${missingRequired.name}" is required and has no database default.`);
  }

  const qualified = quoteQualifiedTable(schema, table);
  if (entries.length === 0) {
    return queryOne<Record<string, unknown>>(`insert into ${qualified} default values returning *`);
  }

  const parsedValues = entries.map(([name, value]) => parseColumnValue(columnMap.get(name)!, value));
  const colList = entries.map(([name]) => quoteIdent(name, "column")).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  return queryOne<Record<string, unknown>>(
    `insert into ${qualified} (${colList}) values (${placeholders}) returning *`,
    parsedValues
  );
}

export async function deleteTableRows(
  schema: string,
  table: string,
  primaryKeyColumn: string,
  primaryKeyValues: unknown[]
): Promise<number> {
  if (primaryKeyValues.length === 0) return 0;

  const columns = await getTableColumns(schema, table);
  const columnMap = new Map(columns.map((column) => [column.name, column]));
  const primaryKey = columnMap.get(primaryKeyColumn);
  if (!primaryKey) throw new TableDataValidationError(`"${primaryKeyColumn}" is not a real column on this table.`);
  requireSinglePrimaryKey(columns, primaryKeyColumn);
  if (primaryKeyValues.length > 1000) throw new TableDataValidationError("Bulk delete is limited to 1000 rows at a time.");

  const values = primaryKeyValues.map((value) => parseColumnValue(primaryKey, value));
  const qualified = quoteQualifiedTable(schema, table);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const result = await getPool().query(
    `delete from ${qualified} where ${quoteIdent(primaryKeyColumn, "column")} in (${placeholders})`,
    values
  );
  return result.rowCount ?? 0;
}
