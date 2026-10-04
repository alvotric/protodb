import { query, queryOne } from "@/lib/db/client";
import { quoteQualifiedTable } from "@/lib/db/identifier";
import { groupForeignKeyMetadata, type ForeignKeyMetadata } from "@/lib/database/foreign-key-metadata";


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
  isPartitioned: boolean;
}

function parseCatalogCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export interface RealColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isIdentity: boolean;
  isGenerated: boolean;
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
export async function listSchemaTables(options: { includePartitioned?: boolean } = {}): Promise<RealTableSummary[]> {
  const relationFilter = options.includePartitioned ? "c.relkind in ('r', 'p')" : "c.relkind = 'r'";
  const rows = await query<{ schema: string; table_name: string; approx_row_count: string; size_bytes: string; is_partitioned: boolean }>(
    `select
       n.nspname as schema,
       c.relname as table_name,
       greatest(c.reltuples, 0)::bigint::text as approx_row_count,
       pg_total_relation_size(c.oid)::text as size_bytes,
       c.relkind = 'p' as is_partitioned
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where ${relationFilter}
       and n.nspname not in ('pg_catalog', 'information_schema', 'protodb_admin')
       and n.nspname not like 'pg\\_toast%'
     order by n.nspname, c.relname`
  );

  return rows.map((r) => ({
    schema: r.schema,
    name: r.table_name,
    approxRowCount: parseCatalogCount(r.approx_row_count),
    sizeBytes: parseCatalogCount(r.size_bytes),
    isPartitioned: r.is_partitioned,
  }));
}

/** The exact row count for one table -- a real `count(*)`, worth its cost only once a specific table is open. */
export async function getExactRowCount(schema: string, table: string): Promise<number> {
  const qualified = quoteQualifiedTable(schema, table);
  const row = await queryOne<{ count: string }>(`select count(*)::text as count from ${qualified}`);
  return row ? parseCatalogCount(row.count) : 0;
}

export async function getTableColumns(schema: string, table: string): Promise<RealColumn[]> {
  const [columns, primaryKeys, foreignKeys] = await Promise.all([
    query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      is_identity: string;
      is_generated: string;
    }>(
      `select column_name, data_type, is_nullable, column_default, is_identity, is_generated
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [schema, table]
    ),
    query<{ column_name: string }>(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_catalog = kcu.constraint_catalog
        and tc.constraint_schema = kcu.constraint_schema
        and tc.constraint_name = kcu.constraint_name
        and tc.table_catalog = kcu.table_catalog
        and tc.table_schema = kcu.table_schema
        and tc.table_name = kcu.table_name
       where tc.table_schema = $1 and tc.table_name = $2 and tc.constraint_type = 'PRIMARY KEY'`,
      [schema, table]
    ),
    query<{ column_name: string }>(
      `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_catalog = kcu.constraint_catalog
        and tc.constraint_schema = kcu.constraint_schema
        and tc.constraint_name = kcu.constraint_name
        and tc.table_catalog = kcu.table_catalog
        and tc.table_schema = kcu.table_schema
        and tc.table_name = kcu.table_name
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
    isIdentity: c.is_identity === "YES",
    isGenerated: c.is_generated !== "NEVER",
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

export type RealForeignKey = ForeignKeyMetadata;

/**
 * Every foreign-key relationship across every non-system schema --
 * what Phase 5's real Schema Diagram draws its connector lines from.
 * One query for the whole database rather than one per table, since
 * the diagram needs all of them at once anyway.
 */
export async function listForeignKeys(): Promise<RealForeignKey[]> {
  const rows = await query<{
    constraint_id: string;
    schema: string;
    table: string;
    constraint_name: string;
    column: string;
    ref_schema: string;
    ref_table: string;
    ref_column: string;
    ordinal_position: number;
    on_update: string;
    on_delete: string;
  }>(
    `select
       fk.oid::text as constraint_id,
       source_ns.nspname as schema,
       source_table.relname as table,
       fk.conname as constraint_name,
       source_column.attname as column,
       target_ns.nspname as ref_schema,
       target_table.relname as ref_table,
       target_column.attname as ref_column,
       key_columns.ordinality as ordinal_position,
       case fk.confupdtype
         when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
         when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
       end as on_update,
       case fk.confdeltype
         when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
         when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
       end as on_delete
     from pg_constraint fk
     join pg_class source_table on source_table.oid = fk.conrelid
     join pg_namespace source_ns on source_ns.oid = source_table.relnamespace
     join pg_class target_table on target_table.oid = fk.confrelid
     join pg_namespace target_ns on target_ns.oid = target_table.relnamespace
     cross join lateral unnest(fk.conkey, fk.confkey) with ordinality
       as key_columns(source_attnum, target_attnum, ordinality)
     join pg_attribute source_column
       on source_column.attrelid = source_table.oid and source_column.attnum = key_columns.source_attnum
     join pg_attribute target_column
       on target_column.attrelid = target_table.oid and target_column.attnum = key_columns.target_attnum
     where fk.contype = 'f'
       and source_ns.nspname not in ('pg_catalog', 'information_schema', 'protodb_admin')
       and source_ns.nspname not like 'pg_toast%'
     order by fk.oid, key_columns.ordinality`
  );

  return groupForeignKeyMetadata(rows).map((foreignKey) => ({
    ...foreignKey,
    column: foreignKey.columns[0]?.column ?? "",
    refColumn: foreignKey.columns[0]?.refColumn ?? "",
  }));
}
