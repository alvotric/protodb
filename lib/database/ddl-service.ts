import { ddlQuery, withDdlTransaction } from "@/lib/db/ddl-client";
import { quoteIdent, quoteQualifiedTable } from "@/lib/db/identifier";
import {
  type AllowedSchemaColumnType,
  type ColumnDefaultSpec,
  type ValidatedColumnSpec,
  validateColumnType,
  renderColumnDefaultSql,
  validateSchemaIdentifier,
} from "@/lib/database/schema-validation";

const PROTECTED_SCHEMAS = new Set(["pg_catalog", "information_schema", "protodb_admin"]);

export class DdlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DdlValidationError";
  }
}

function assertMutableSchema(schema: string): void {
  validateSchemaIdentifier(schema, "schema");
  if (PROTECTED_SCHEMAS.has(schema) || schema.startsWith("pg_toast")) {
    throw new DdlValidationError(`Schema "${schema}" is protected and cannot be modified through ProtoDB.`);
  }
}

export type NewColumnSpec = ValidatedColumnSpec;

async function ddlTableExists(schema: string, table: string): Promise<boolean> {
  const rows = await ddlQuery<{ exists: boolean }>(
    `select exists (
       select 1 from information_schema.tables
       where table_schema = $1 and table_name = $2 and table_type = 'BASE TABLE'
     ) as exists`,
    [schema, table]
  );
  return rows[0]?.exists === true;
}

async function requireTable(schema: string, table: string): Promise<string> {
  assertMutableSchema(schema);
  validateSchemaIdentifier(table, "table");
  const qualified = quoteQualifiedTable(schema, table);
  if (!(await ddlTableExists(schema, table))) throw new DdlValidationError(`"${schema}.${table}" doesn't exist.`);
  return qualified;
}

interface DdlColumn {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
}

async function getDdlColumn(schema: string, table: string, column: string): Promise<DdlColumn> {
  validateSchemaIdentifier(schema, "schema");
  validateSchemaIdentifier(table, "table");
  validateSchemaIdentifier(column, "column");
  const rows = await ddlQuery<DdlColumn>(
    `select column_name, data_type, udt_name, is_nullable
     from information_schema.columns
     where table_schema = $1 and table_name = $2 and column_name = $3`,
    [schema, table, column]
  );
  const result = rows[0];
  if (!result) throw new DdlValidationError(`Column "${column}" doesn't exist in "${schema}.${table}".`);
  return result;
}

function defaultTypeFor(column: DdlColumn): AllowedSchemaColumnType {
  const type = column.data_type === "timestamp with time zone"
    ? "timestamptz"
    : column.data_type === "character varying" || column.data_type === "character"
      ? "text"
      : column.data_type;
  return validateColumnType(type, "column type");
}

/**
 * Creates one real table through the dedicated server-side DDL
 * connection. Column definitions are structured and all SQL
 * identifiers and types are validated before interpolation.
 */
export async function createTable(schema: string, table: string, columns: NewColumnSpec[]): Promise<void> {
  assertMutableSchema(schema);
  validateSchemaIdentifier(table, "table");
  const qualified = quoteQualifiedTable(schema, table);
  if (columns.length === 0) throw new DdlValidationError("A table needs at least one column.");
  if (columns.filter((column) => column.isPrimaryKey).length > 1) {
    throw new DdlValidationError("Only one primary-key column is supported; composite primary keys are not available.");
  }
  if (columns.some((column) => column.isPrimaryKey && column.nullable)) {
    throw new DdlValidationError("Primary-key columns must be non-nullable.");
  }
  const names = new Set<string>();
  const columnDefs = columns.map((col) => {
    validateSchemaIdentifier(col.name, "column");
    const name = quoteIdent(col.name, "column");
    if (names.has(col.name)) throw new DdlValidationError(`Column "${col.name}" is listed more than once.`);
    names.add(col.name);
    const type = validateColumnType(col.type);
    if (typeof col.nullable !== "boolean") throw new DdlValidationError(`Column "${col.name}" nullable must be a boolean.`);
    const parts = [name, type];
    if (!col.nullable) parts.push("not null");
    if (col.isPrimaryKey) parts.push("primary key");
    if (col.defaultValue) parts.push("default", renderColumnDefaultSql(col.defaultValue, type));
    return parts.join(" ");
  });

  if (await ddlTableExists(schema, table)) throw new DdlValidationError(`"${schema}.${table}" already exists.`);
  await ddlQuery(`create table ${qualified} (${columnDefs.join(", ")})`);
}

export async function dropTable(schema: string, table: string): Promise<void> {
  const qualified = await requireTable(schema, table);
  await ddlQuery(`drop table ${qualified}`);
}

export async function addColumn(
  schema: string,
  table: string,
  column: { name: string; type: string; nullable: boolean; defaultValue?: ColumnDefaultSpec }
): Promise<void> {
  const qualified = await requireTable(schema, table);
  validateSchemaIdentifier(column.name, "column");
  const name = quoteIdent(column.name, "column");
  const type = validateColumnType(column.type);
  if (typeof column.nullable !== "boolean") throw new DdlValidationError("nullable must be a boolean.");
  const duplicate = await ddlQuery<{ exists: boolean }>(
    `select exists(select 1 from information_schema.columns where table_schema = $1 and table_name = $2 and column_name = $3) as exists`,
    [schema, table, column.name]
  );
  if (duplicate[0]?.exists) throw new DdlValidationError(`Column "${column.name}" already exists in "${schema}.${table}".`);
  // Adding NOT NULL without a default to a populated table always fails in
  // PostgreSQL and would surface as a raw constraint error. Fail explicitly
  // before issuing DDL so the UI can explain the requirement.
  if (!column.nullable && !column.defaultValue) {
    const populated = await ddlQuery<{ exists: boolean }>(
      `select exists(select 1 from ${qualified} limit 1) as exists`
    );
    if (populated[0]?.exists) {
      throw new DdlValidationError(
        `Adding a NOT NULL column without a default to a populated table would fail. Provide a default value or add the column as nullable first.`
      );
    }
  }
  const parts = [`alter table ${qualified} add column ${name} ${type}`];
  if (!column.nullable) parts.push("not null");
  if (column.defaultValue) parts.push("default", renderColumnDefaultSql(column.defaultValue, type));
  await ddlQuery(parts.join(" "));
}

export async function dropColumn(schema: string, table: string, columnName: string): Promise<void> {
  const qualified = await requireTable(schema, table);
  const column = await getDdlColumn(schema, table, columnName);
  const primaryKey = await ddlQuery<{ column_name: string }>(
    `select kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_catalog = kcu.constraint_catalog
      and tc.constraint_schema = kcu.constraint_schema
      and tc.constraint_name = kcu.constraint_name
      and tc.table_catalog = kcu.table_catalog
      and tc.table_schema = kcu.table_schema
      and tc.table_name = kcu.table_name
     where tc.table_schema = $1 and tc.table_name = $2
       and tc.constraint_type = 'PRIMARY KEY' and kcu.column_name = $3`,
    [schema, table, column.column_name]
  );
  if (primaryKey.length) throw new DdlValidationError("Drop the primary-key constraint before dropping its column.");
  await ddlQuery(`alter table ${qualified} drop column ${quoteIdent(columnName, "column")}`);
}

export async function renameColumn(schema: string, table: string, oldName: string, newName: string): Promise<void> {
  const qualified = await requireTable(schema, table);
  await getDdlColumn(schema, table, oldName);
  validateSchemaIdentifier(newName, "column");
  if (oldName === newName) throw new DdlValidationError("The new column name must differ from the current name.");
  const duplicate = await ddlQuery<{ exists: boolean }>(
    `select exists(select 1 from information_schema.columns where table_schema = $1 and table_name = $2 and column_name = $3) as exists`,
    [schema, table, newName]
  );
  if (duplicate[0]?.exists) throw new DdlValidationError(`Column "${newName}" already exists in "${schema}.${table}".`);
  await ddlQuery(
    `alter table ${qualified} rename column ${quoteIdent(oldName, "column")} to ${quoteIdent(newName, "column")}`
  );
}

export async function alterColumnType(schema: string, table: string, columnName: string, newType: string): Promise<void> {
  const qualified = await requireTable(schema, table);
  const current = await getDdlColumn(schema, table, columnName);
  const type = validateColumnType(newType);
  // Single atomic ALTER TABLE TYPE statement: PostgreSQL either converts all
  // rows or rolls back. No USING clause is generated, so values that cannot
  // convert fail safely instead of being silently coerced.
  if (defaultTypeFor(current) === type) {
    throw new DdlValidationError(`Column "${columnName}" is already ${type}.`);
  }
  try {
    await ddlQuery(`alter table ${qualified} alter column ${quoteIdent(columnName, "column")} type ${type}`);
  } catch (error) {
    // Hide PG internals; the only safe actionable explanation is conversion.
    console.error(`ALTER COLUMN TYPE failed for ${schema}.${table}.${columnName}`, error);
    throw new DdlValidationError(
      `Changing the column type failed. Existing data could not be converted to ${type} with a plain ALTER TYPE (no USING conversion is applied).`
    );
  }
}

export async function setColumnNullable(schema: string, table: string, columnName: string, nullable: boolean): Promise<void> {
  const qualified = await requireTable(schema, table);
  await getDdlColumn(schema, table, columnName);
  if (typeof nullable !== "boolean") throw new DdlValidationError("nullable must be a boolean.");
  const action = nullable ? "drop not null" : "set not null";
  await ddlQuery(`alter table ${qualified} alter column ${quoteIdent(columnName, "column")} ${action}`);
}

export async function setColumnDefault(
  schema: string,
  table: string,
  columnName: string,
  defaultValue: ColumnDefaultSpec | null
): Promise<void> {
  const qualified = await requireTable(schema, table);
  const column = await getDdlColumn(schema, table, columnName);
  const action = defaultValue === null
    ? "drop default"
    : `set default ${renderColumnDefaultSql(defaultValue, defaultTypeFor(column))}`;
  await ddlQuery(`alter table ${qualified} alter column ${quoteIdent(columnName, "column")} ${action}`);
}

export async function setSingleColumnPrimaryKey(
  schema: string,
  table: string,
  columnName: string,
  enabled: boolean
): Promise<void> {
  const qualified = await requireTable(schema, table);
  const column = await getDdlColumn(schema, table, columnName);
  const keys = await ddlQuery<{ constraint_name: string; column_name: string; ordinal_position: number }>(
    `select tc.constraint_name, kcu.column_name, kcu.ordinal_position
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_catalog = kcu.constraint_catalog
      and tc.constraint_schema = kcu.constraint_schema
      and tc.constraint_name = kcu.constraint_name
      and tc.table_catalog = kcu.table_catalog
      and tc.table_schema = kcu.table_schema
      and tc.table_name = kcu.table_name
     where tc.table_schema = $1 and tc.table_name = $2
       and tc.constraint_type = 'PRIMARY KEY'
     order by kcu.ordinal_position`,
    [schema, table]
  );
  if (enabled) {
    if (keys.length) throw new DdlValidationError("This table already has a primary key. Remove it before selecting another column.");
    if (column.is_nullable === "YES") {
      throw new DdlValidationError("Set this column to NOT NULL explicitly before making it a primary key.");
    }
    await ddlQuery(`alter table ${qualified} add primary key (${quoteIdent(columnName, "column")})`);
    return;
  }

  if (!keys.length || keys[0].column_name !== columnName || keys.length !== 1) {
    throw new DdlValidationError("Only a single-column primary key can be removed through this operation.");
  }
  await ddlQuery(`alter table ${qualified} drop constraint ${quoteIdent(keys[0].constraint_name, "constraint")}`);
}

interface ForeignKeyColumnInfo {
  data_type: string;
  udt_name: string;
}

async function getForeignKeyColumn(schema: string, table: string, column: string): Promise<ForeignKeyColumnInfo> {
  validateSchemaIdentifier(schema, "schema");
  validateSchemaIdentifier(table, "table");
  validateSchemaIdentifier(column, "column");
  const rows = await ddlQuery<ForeignKeyColumnInfo>(
    `select data_type, udt_name from information_schema.columns
     where table_schema = $1 and table_name = $2 and column_name = $3`,
    [schema, table, column]
  );
  if (!rows[0]) throw new DdlValidationError(`Column "${column}" doesn't exist in "${schema}.${table}".`);
  return rows[0];
}

export async function createForeignKey(input: {
  schema: string;
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
  constraintName: string;
}): Promise<void> {
  const definition = await validateForeignKeyDefinition(input);
  const existingConstraint = await ddlQuery<{ exists: boolean }>(
    `select exists (
       select 1 from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = $1 and t.relname = $2 and c.conname = $3
     ) as exists`,
    [input.schema, input.table, input.constraintName]
  );
  if (existingConstraint[0]?.exists) throw new DdlValidationError(`Constraint "${input.constraintName}" already exists on this table.`);

  await ddlQuery(definition.statement);
}

async function validateForeignKeyDefinition(input: {
  schema: string;
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
  constraintName: string;
}): Promise<{ statement: string }> {
  assertMutableSchema(input.schema);
  assertMutableSchema(input.refSchema);
  validateSchemaIdentifier(input.constraintName, "constraint");
  const sourceTable = await requireTable(input.schema, input.table);
  const targetTable = await requireTable(input.refSchema, input.refTable);
  const sourceColumn = await getForeignKeyColumn(input.schema, input.table, input.column);
  const targetColumn = await getForeignKeyColumn(input.refSchema, input.refTable, input.refColumn);
  if (sourceColumn.udt_name !== targetColumn.udt_name || sourceColumn.data_type !== targetColumn.data_type) {
    throw new DdlValidationError("Foreign-key columns must have the same PostgreSQL type.");
  }

  const uniqueTarget = await ddlQuery<{ is_key: boolean }>(
    `select exists (
       select 1
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_catalog = kcu.constraint_catalog
        and tc.constraint_schema = kcu.constraint_schema
        and tc.constraint_name = kcu.constraint_name
        and tc.table_catalog = kcu.table_catalog
        and tc.table_schema = kcu.table_schema
        and tc.table_name = kcu.table_name
       where tc.table_schema = $1 and tc.table_name = $2
         and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
         and kcu.column_name = $3
         and (select count(*) from information_schema.key_column_usage all_keys
              where all_keys.constraint_catalog = tc.constraint_catalog
                and all_keys.constraint_schema = tc.constraint_schema
                and all_keys.constraint_name = tc.constraint_name
                and all_keys.table_schema = tc.table_schema
                and all_keys.table_name = tc.table_name) = 1
     ) as is_key`,
    [input.refSchema, input.refTable, input.refColumn]
  );
  if (!uniqueTarget[0]?.is_key) throw new DdlValidationError("The referenced column must be a single-column primary key or unique key.");

  return {
    statement: `alter table ${sourceTable} add constraint ${quoteIdent(input.constraintName, "constraint")}
      foreign key (${quoteIdent(input.column, "column")})
      references ${targetTable} (${quoteIdent(input.refColumn, "column")})`,
  };
}

export async function replaceForeignKey(input: {
  schema: string;
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
  constraintName: string;
}): Promise<void> {
  const definition = await validateForeignKeyDefinition(input);
  const qualified = await requireTable(input.schema, input.table);
  const rows = await ddlQuery<{ exists: boolean }>(
    `select exists (
       select 1 from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.contype = 'f' and n.nspname = $1 and t.relname = $2 and c.conname = $3
     ) as exists`,
    [input.schema, input.table, input.constraintName]
  );
  if (!rows[0]?.exists) throw new DdlValidationError(`Foreign-key constraint "${input.constraintName}" doesn't exist on "${input.schema}.${input.table}".`);

  await withDdlTransaction(async (client) => {
    await client.query(`alter table ${qualified} drop constraint ${quoteIdent(input.constraintName, "constraint")}`);
    await client.query(definition.statement);
  });
}

export async function dropForeignKey(schema: string, table: string, constraintName: string): Promise<void> {
  const qualified = await requireTable(schema, table);
  validateSchemaIdentifier(constraintName, "constraint");
  const rows = await ddlQuery<{ exists: boolean }>(
    `select exists (
       select 1 from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.contype = 'f' and n.nspname = $1 and t.relname = $2 and c.conname = $3
     ) as exists`,
    [schema, table, constraintName]
  );
  if (!rows[0]?.exists) throw new DdlValidationError(`Foreign-key constraint "${constraintName}" doesn't exist on "${schema}.${table}".`);
  await ddlQuery(`alter table ${qualified} drop constraint ${quoteIdent(constraintName, "constraint")}`);
}
