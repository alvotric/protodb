import { query, queryOne } from "@/lib/db/client";
import { quoteQualifiedTable } from "@/lib/db/identifier";


export interface RealSchemaSummary {
  name: string;
}

/** User-created schemas available to the admin UI. Internal/system schemas are excluded. */
export async function listSchemas(): Promise<RealSchemaSummary[]> {
  const rows = await query<{ schema_name: string }>(
    `select schema_name
     from information_schema.schemata
     where schema_name not in ('pg_catalog', 'information_schema', 'protodb_admin')
       and schema_name not like 'pg\\_toast%'
     order by schema_name`
  );

  return rows.map((r) => ({ name: r.schema_name }));
}

export interface RealTableSummary {
  schema: string;
  name: string;
  approxRowCount: number;
  sizeBytes: number;
}

export interface RealColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

/**
 * Phase 10 — Backend API & Real Data Integration (Part 2).
 *
 * Every table in every schema except this app's own bookkeeping
 * (`protodb_admin`, set up in migrations/001) and Postgres's own
 * internal ones. Row counts here are `pg_class.reltuples` -- an
 * estimate Postgres itself maintains via autovacuum/analyze, not a
 * live `count(*)` -- so listing hundreds of tables stays fast
 * regardless of how large any one of them is. `getExactRowCount()`
 * below gets the exact number, but only for one table at a time (the
 * cost that's fine to pay once you've actually opened it).
 */
export async function listSchemaTables(): Promise<RealTableSummary[]> {
  const rows = await query<{ schema: string; table_name: string; approx_row_count: string; size_bytes: string }>(
    `select
       n.nspname as schema,
       c.relname as table_name,
       greatest(c.reltuples, 0)::bigint::text as approx_row_count,
       pg_total_relation_size(c.oid)::text as size_bytes
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r'
       and n.nspname not in ('pg_catalog', 'information_schema', 'protodb_admin')
       and n.nspname not like 'pg\\_toast%'
     order by n.nspname, c.relname`
  );

  return rows.map((r) => ({
    schema: r.schema,
    name: r.table_name,
    approxRowCount: parseInt(r.approx_row_count, 10),
    sizeBytes: parseInt(r.size_bytes, 10),
  }));
}

/** The exact row count for one table -- a real `count(*)`, worth its cost only once a specific table is open. */
export async function getExactRowCount(schema: string, table: string): Promise<number> {
  const qualified = quoteQualifiedTable(schema, table);
  const row = await queryOne<{ count: string }>(`select count(*)::text as count from ${qualified}`);
  return row ? parseInt(row.count, 10) : 0;
}

export async function getTableColumns(schema: string, table: string): Promise<RealColumn[]> {
  const [columns, primaryKeys, foreignKeys] = await Promise.all([
    query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [schema, table]
    ),
    query<{ column_name: string }>(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
       where tc.table_schema = $1 and tc.table_name = $2 and tc.constraint_type = 'PRIMARY KEY'`,
      [schema, table]
    ),
    query<{ column_name: string }>(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
       where tc.table_schema = $1 and tc.table_name = $2 and tc.constraint_type = 'FOREIGN KEY'`,
      [schema, table]
    ),
  ]);

  const pkNames = new Set(primaryKeys.map((r) => r.column_name));
  const fkNames = new Set(foreignKeys.map((r) => r.column_name));

  return columns.map((c) => ({
    name: c.column_name,
    type: c.data_type,
    nullable: c.is_nullable === "YES",
    default: c.column_default,
    isPrimaryKey: pkNames.has(c.column_name),
    isForeignKey: fkNames.has(c.column_name),
  }));
}

/** Table names are attacker-shaped input by the time they reach a route handler (they come from the URL) -- this confirms one is real before any query below ever interpolates it into SQL, on top of quoteQualifiedTable()'s own character-level check. */
export async function tableExists(schema: string, table: string): Promise<boolean> {
  const row = await queryOne(
    `select 1 from information_schema.tables where table_schema = $1 and table_name = $2 and table_type = 'BASE TABLE'`,
    [schema, table]
  );
  return row !== null;
}

export interface RealForeignKey {
  schema: string;
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
}

/**
 * Every foreign-key relationship across every non-system schema --
 * what Phase 5's real Schema Diagram draws its connector lines from.
 * One query for the whole database rather than one per table, since
 * the diagram needs all of them at once anyway.
 */
export async function listForeignKeys(): Promise<RealForeignKey[]> {
  const rows = await query<{
    table_schema: string;
    table_name: string;
    column_name: string;
    ref_schema: string;
    ref_table: string;
    ref_column: string;
  }>(
    `select
       tc.table_schema,
       tc.table_name,
       kcu.column_name,
       ccu.table_schema as ref_schema,
       ccu.table_name as ref_table,
       ccu.column_name as ref_column
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
     join information_schema.constraint_column_usage ccu
       on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema not in ('pg_catalog', 'information_schema', 'protodb_admin')`
  );

  return rows.map((r) => ({
    schema: r.table_schema,
    table: r.table_name,
    column: r.column_name,
    refSchema: r.ref_schema,
    refTable: r.ref_table,
    refColumn: r.ref_column,
  }));
}
