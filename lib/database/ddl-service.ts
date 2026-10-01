import { ddlQuery } from "@/lib/db/ddl-client";
import { query } from "@/lib/db/client";
import { quoteIdent, quoteQualifiedTable } from "@/lib/db/identifier";
import { tableExists } from "@/lib/database/schema-service";

/**
 * Phase 10 — Backend API & Real Data Integration (Part 3).
 *
 * The real backing for Phase 5's Schema Designer -- and the highest-
 * stakes code in this app. Every operation here changes the actual
 * structure of a real table, some of them irreversibly (dropping a
 * column drops its data with it). Three things every function here
 * does without exception:
 *
 *  1. Every identifier (schema/table/column name) goes through
 *     `quoteIdent()`/`quoteQualifiedTable()` -- the same strict
 *     allow-list used everywhere else in this app, never a clever
 *     escaping trick.
 *  2. Every column *type* is checked against `ALLOWED_TYPES` below.
 *     Types can't be parameterized either (same as identifiers), and
 *     unlike a column name a bad type can't even be caught by a
 *     generic "is this a real identifier" regex -- it has to be
 *     checked against a fixed list this app actually offers in its
 *     own UI, nothing else.
 *  3. Nothing here guesses at forgiveness -- if a change is invalid
 *     (a NOT NULL column added to a non-empty table with no default,
 *     a type change existing data can't cast to), Postgres itself
 *     rejects it and that real error is what reaches the caller,
 *     not a swallowed failure or a fabricated success.
 *
 * DDL executes through the separate DATABASE_DDL_URL connection.
 * The normal DATABASE_URL role therefore never receives schema-change
 * privileges.
 */
const ALLOWED_TYPES = new Set(["uuid", "text", "integer", "bigint", "boolean", "timestamptz", "numeric", "jsonb"]);
const PROTECTED_SCHEMAS = new Set(["pg_catalog", "information_schema", "protodb_admin"]);

function assertMutableSchema(schema: string): void {
  if (PROTECTED_SCHEMAS.has(schema) || schema.startsWith("pg_toast")) {
    throw new Error(`Schema "${schema}" is protected and cannot be modified through ProtoDB.`);
  }
}

function assertAllowedType(type: string): string {
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`"${type}" isn't a supported column type. Allowed: ${Array.from(ALLOWED_TYPES).join(", ")}.`);
  }
  return type;
}

export interface NewColumnSpec {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
}

/**
 * Creates a real table. At least one column is required (an empty
 * table with zero columns isn't valid Postgres anyway); if exactly
 * one column is marked as primary key, it's declared as one at
 * creation time -- composite primary keys aren't offered by this
 * pass's UI, so this doesn't need to handle them.
 */
export async function createTable(schema: string, table: string, columns: NewColumnSpec[]): Promise<void> {
  assertMutableSchema(schema);
  if (columns.length === 0) throw new Error("A table needs at least one column.");
  if (await tableExists(schema, table)) throw new Error(`"${schema}.${table}" already exists.`);

  const qualified = quoteQualifiedTable(schema, table);
  const columnDefs = columns.map((col) => {
    const type = assertAllowedType(col.type);
    const parts = [quoteIdent(col.name, "column"), type];
    if (!col.nullable) parts.push("not null");
    if (col.isPrimaryKey) parts.push("primary key");
    return parts.join(" ");
  });

  await ddlQuery(`create table ${qualified} (${columnDefs.join(", ")})`);
}

export async function dropTable(schema: string, table: string): Promise<void> {
  assertMutableSchema(schema);
  if (!(await tableExists(schema, table))) throw new Error(`"${schema}.${table}" doesn't exist.`);
  const qualified = quoteQualifiedTable(schema, table);
  await ddlQuery(`drop table ${qualified}`);
}

export async function addColumn(
  schema: string,
  table: string,
  column: { name: string; type: string; nullable: boolean }
): Promise<void> {
  assertMutableSchema(schema);
  const qualified = quoteQualifiedTable(schema, table);
  const type = assertAllowedType(column.type);
  const parts = [`alter table ${qualified} add column ${quoteIdent(column.name, "column")} ${type}`];
  if (!column.nullable) parts.push("not null");
  await ddlQuery(parts.join(" "));
}

export async function dropColumn(schema: string, table: string, columnName: string): Promise<void> {
  assertMutableSchema(schema);
  const qualified = quoteQualifiedTable(schema, table);
  await ddlQuery(`alter table ${qualified} drop column ${quoteIdent(columnName, "column")}`);
}

export async function renameColumn(schema: string, table: string, oldName: string, newName: string): Promise<void> {
  assertMutableSchema(schema);
  const qualified = quoteQualifiedTable(schema, table);
  await ddlQuery(
    `alter table ${qualified} rename column ${quoteIdent(oldName, "column")} to ${quoteIdent(newName, "column")}`
  );
}

export async function alterColumnType(schema: string, table: string, columnName: string, newType: string): Promise<void> {
  assertMutableSchema(schema);
  const qualified = quoteQualifiedTable(schema, table);
  const type = assertAllowedType(newType);
  await ddlQuery(`alter table ${qualified} alter column ${quoteIdent(columnName, "column")} type ${type}`);
}

export async function setColumnNullable(schema: string, table: string, columnName: string, nullable: boolean): Promise<void> {
  assertMutableSchema(schema);
  const qualified = quoteQualifiedTable(schema, table);
  const action = nullable ? "drop not null" : "set not null";
  await ddlQuery(`alter table ${qualified} alter column ${quoteIdent(columnName, "column")} ${action}`);
}
