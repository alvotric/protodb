/**
 * Phase 10 — Backend API & Real Data Integration (Part 2).
 *
 * Table/schema/column names can never be parameterized the normal
 * way -- `$1`-style placeholders only work for VALUES, not
 * identifiers, in every SQL driver including `pg`. Every route in
 * lib/database/* that builds a query like `select * from ${table}`
 * runs its `table`/`schema`/`column` arguments through this first.
 *
 * Rejecting anything outside `[a-zA-Z_][a-zA-Z0-9_]*` (real Postgres
 * identifiers can technically contain more via double-quoting, but
 * this app never creates such names itself) is deliberately stricter
 * than Postgres itself allows, in exchange for a validation rule
 * simple enough to be confident is airtight -- a strict allow-list
 * beats a clever escape function here.
 */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class UnsafeIdentifierError extends Error {
  constructor(kind: string, value: string) {
    super(`Invalid ${kind} name: "${value}"`);
    this.name = "UnsafeIdentifierError";
  }
}

/** Validates and double-quotes a single identifier (schema, table, or column name) for safe interpolation into raw SQL. */
export function quoteIdent(value: string, kind = "identifier"): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new UnsafeIdentifierError(kind, value);
  }
  return `"${value}"`;
}

/** `schema.table`, each part independently validated and quoted. */
export function quoteQualifiedTable(schema: string, table: string): string {
  return `${quoteIdent(schema, "schema")}.${quoteIdent(table, "table")}`;
}
