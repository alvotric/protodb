export const ALLOWED_SCHEMA_COLUMN_TYPES = [
  "uuid",
  "text",
  "integer",
  "bigint",
  "boolean",
  "timestamptz",
  "numeric",
  "jsonb",
] as const;

export type AllowedSchemaColumnType = (typeof ALLOWED_SCHEMA_COLUMN_TYPES)[number];

export type ColumnDefaultSpec =
  | { kind: "literal"; value: string }
  | { kind: "expression"; value: "CURRENT_TIMESTAMP" | "now()" | "gen_random_uuid()" };

export class SchemaValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "SchemaValidationError";
    this.field = field;
  }
}

export interface ValidatedColumnSpec {
  name: string;
  type: AllowedSchemaColumnType;
  nullable: boolean;
  isPrimaryKey?: boolean;
  defaultValue?: ColumnDefaultSpec;
}

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const allowedTypes = new Set<string>(ALLOWED_SCHEMA_COLUMN_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertAllowedKeys(value: Record<string, unknown>, keys: string[], field: string): void {
  const unexpected = Object.keys(value).find((key) => !keys.includes(key));
  if (unexpected) throw new SchemaValidationError(`Unexpected field "${unexpected}" in ${field}.`, field);
}

export function validateSchemaIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 63 || !SAFE_IDENTIFIER.test(value)) {
    throw new SchemaValidationError(`${field} must be a valid PostgreSQL identifier (letters, digits, and underscores; max 63 characters).`, field);
  }
  return value;
}

export function validateColumnType(value: unknown, field = "type"): AllowedSchemaColumnType {
  if (typeof value !== "string" || !allowedTypes.has(value)) {
    throw new SchemaValidationError(`${field} must be one of: ${ALLOWED_SCHEMA_COLUMN_TYPES.join(", ")}.`, field);
  }
  return value as AllowedSchemaColumnType;
}

function validateLiteralDefault(value: string, type: AllowedSchemaColumnType): void {
  switch (type) {
    case "uuid":
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new SchemaValidationError("The default must be a valid UUID.", "defaultValue");
      }
      return;
    case "integer":
      if (!/^-?(0|[1-9]\d*)$/.test(value) || Number(value) < -2147483648 || Number(value) > 2147483647) {
        throw new SchemaValidationError("The default must be a valid 32-bit integer.", "defaultValue");
      }
      return;
    case "bigint":
      if (!/^-?(0|[1-9]\d*)$/.test(value)) {
        throw new SchemaValidationError("The default must be a valid integer.", "defaultValue");
      }
      try {
        const parsed = BigInt(value);
        if (parsed < -9223372036854775808n || parsed > 9223372036854775807n) {
          throw new SchemaValidationError("The default is outside the bigint range.", "defaultValue");
        }
      } catch (error) {
        if (error instanceof SchemaValidationError) throw error;
        throw new SchemaValidationError("The default must be a valid bigint.", "defaultValue");
      }
      return;
    case "numeric":
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
        throw new SchemaValidationError("The default must be a valid numeric value.", "defaultValue");
      }
      return;
    case "boolean":
      if (value !== "true" && value !== "false") {
        throw new SchemaValidationError('The boolean default must be "true" or "false".', "defaultValue");
      }
      return;
    case "timestamptz":
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
        throw new SchemaValidationError("The default must be an ISO-8601 timestamp with a timezone.", "defaultValue");
      }
      return;
    case "jsonb":
      try {
        JSON.parse(value);
      } catch {
        throw new SchemaValidationError("The default must contain valid JSON.", "defaultValue");
      }
      return;
    case "text":
      return;
  }
}

export function validateColumnDefault(value: unknown, type: AllowedSchemaColumnType): ColumnDefaultSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SchemaValidationError("defaultValue must be a literal or an allowed expression.", "defaultValue");
  }

  const candidate = value as Record<string, unknown>;
  assertAllowedKeys(candidate, ["kind", "value"], "defaultValue");
  if (candidate.kind === "literal" && typeof candidate.value === "string") {
    validateLiteralDefault(candidate.value, type);
    return { kind: "literal", value: candidate.value };
  }

  if (candidate.kind === "expression" && typeof candidate.value === "string") {
    const allowedByType: Partial<Record<AllowedSchemaColumnType, readonly string[]>> = {
      uuid: ["gen_random_uuid()"],
      timestamptz: ["CURRENT_TIMESTAMP", "now()"],
    };
    if (allowedByType[type]?.includes(candidate.value)) {
      return { kind: "expression", value: candidate.value as "CURRENT_TIMESTAMP" | "now()" | "gen_random_uuid()" };
    }
  }

  throw new SchemaValidationError("That default expression is not supported for this column type.", "defaultValue");
}

export function renderColumnDefaultSql(value: ColumnDefaultSpec, type: AllowedSchemaColumnType): string {
  const validated = validateColumnDefault(value, type);
  if (validated.kind === "expression") return validated.value;
  const escaped = validated.value.replace(/\\/g, "\\\\").replace(/'/g, "''");
  if (type === "integer" || type === "bigint" || type === "numeric" || type === "boolean") return escaped;
  return `E'${escaped}'::${type}`;
}

export function parseCreateTablePayload(value: unknown): {
  schema: string;
  table: string;
  columns: ValidatedColumnSpec[];
} {
  if (!isRecord(value)) throw new SchemaValidationError("Request body must be a JSON object.");
  assertAllowedKeys(value, ["schema", "table", "columns"], "request");

  const schema = validateSchemaIdentifier(value.schema, "schema");
  const table = validateSchemaIdentifier(value.table, "table");
  if (!Array.isArray(value.columns) || value.columns.length === 0) {
    throw new SchemaValidationError("At least one column definition is required.", "columns");
  }

  const seen = new Set<string>();
  const columns = value.columns.map((entry, index): ValidatedColumnSpec => {
    const field = `columns[${index}]`;
    if (!isRecord(entry)) throw new SchemaValidationError(`${field} must be an object.`, field);
    assertAllowedKeys(entry, ["name", "type", "nullable", "isPrimaryKey", "defaultValue"], field);
    const name = validateSchemaIdentifier(entry.name, `${field}.name`);
    if (seen.has(name)) throw new SchemaValidationError(`Column "${name}" is listed more than once.`, `${field}.name`);
    seen.add(name);
    const type = validateColumnType(entry.type, `${field}.type`);
    if (typeof entry.nullable !== "boolean") throw new SchemaValidationError(`${field}.nullable must be a boolean.`, `${field}.nullable`);
    if (entry.isPrimaryKey !== undefined && typeof entry.isPrimaryKey !== "boolean") {
      throw new SchemaValidationError(`${field}.isPrimaryKey must be a boolean.`, `${field}.isPrimaryKey`);
    }
    if (entry.isPrimaryKey === true && entry.nullable === true) {
      throw new SchemaValidationError(`${field} primary-key column must be non-nullable.`, `${field}.nullable`);
    }
    const column: ValidatedColumnSpec = { name, type, nullable: entry.nullable };
    if (entry.isPrimaryKey === true) column.isPrimaryKey = true;
    if (entry.defaultValue !== undefined) column.defaultValue = validateColumnDefault(entry.defaultValue, type);
    return column;
  });

  if (columns.filter((column) => column.isPrimaryKey).length > 1) {
    throw new SchemaValidationError("Only one primary-key column is supported; composite primary keys are not available.", "columns");
  }

  return { schema, table, columns };
}

export function parseAddColumnPayload(value: unknown): {
  name: string;
  type: AllowedSchemaColumnType;
  nullable: boolean;
  defaultValue?: ColumnDefaultSpec;
} {
  if (!isRecord(value)) throw new SchemaValidationError("Request body must be a JSON object.");
  assertAllowedKeys(value, ["name", "type", "nullable", "defaultValue"], "request");
  const name = validateSchemaIdentifier(value.name, "name");
  const type = validateColumnType(value.type);
  if (typeof value.nullable !== "boolean") throw new SchemaValidationError("nullable must be a boolean.", "nullable");
  const result: { name: string; type: AllowedSchemaColumnType; nullable: boolean; defaultValue?: ColumnDefaultSpec } = {
    name,
    type,
    nullable: value.nullable,
  };
  if (value.defaultValue !== undefined) result.defaultValue = validateColumnDefault(value.defaultValue, type);
  return result;
}

export type ColumnPatch =
  | { newName: string }
  | { newType: AllowedSchemaColumnType }
  | { nullable: boolean }
  | { defaultValue: ColumnDefaultSpec | null };

export function parseColumnPatchPayload(value: unknown): ColumnPatch {
  if (!isRecord(value)) throw new SchemaValidationError("Request body must be a JSON object.");
  const keys = Object.keys(value);
  if (keys.length !== 1) throw new SchemaValidationError("Send exactly one column change per request.");
  if (keys[0] === "newName") return { newName: validateSchemaIdentifier(value.newName, "newName") };
  if (keys[0] === "newType") return { newType: validateColumnType(value.newType, "newType") };
  if (keys[0] === "nullable" && typeof value.nullable === "boolean") return { nullable: value.nullable };
  if (keys[0] === "defaultValue") {
    if (value.defaultValue === null) return { defaultValue: null };
    if (
      isRecord(value.defaultValue) &&
      ((value.defaultValue.kind === "literal" && typeof value.defaultValue.value === "string") ||
        (value.defaultValue.kind === "expression" && typeof value.defaultValue.value === "string"))
    ) {
      assertAllowedKeys(value.defaultValue, ["kind", "value"], "defaultValue");
      return { defaultValue: value.defaultValue as ColumnDefaultSpec };
    }
    throw new SchemaValidationError("defaultValue must be null or a structured literal/expression.");
  }
  throw new SchemaValidationError("Send one valid newName, newType, nullable, or defaultValue field.");
}

export function parsePrimaryKeyPayload(value: unknown): { column: string; enabled: boolean } {
  if (!isRecord(value)) throw new SchemaValidationError("Request body must be a JSON object.");
  assertAllowedKeys(value, ["column", "enabled"], "request");
  return {
    column: validateSchemaIdentifier(value.column, "column"),
    enabled: typeof value.enabled === "boolean"
      ? value.enabled
      : (() => { throw new SchemaValidationError("enabled must be a boolean.", "enabled"); })(),
  };
}

export function parseForeignKeyPayload(value: unknown): {
  schema: string;
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
  constraintName: string;
} {
  if (!isRecord(value)) throw new SchemaValidationError("Request body must be a JSON object.");
  assertAllowedKeys(value, ["schema", "table", "column", "refSchema", "refTable", "refColumn", "constraintName"], "request");
  return {
    schema: validateSchemaIdentifier(value.schema, "schema"),
    table: validateSchemaIdentifier(value.table, "table"),
    column: validateSchemaIdentifier(value.column, "column"),
    refSchema: validateSchemaIdentifier(value.refSchema, "refSchema"),
    refTable: validateSchemaIdentifier(value.refTable, "refTable"),
    refColumn: validateSchemaIdentifier(value.refColumn, "refColumn"),
    constraintName: validateSchemaIdentifier(value.constraintName, "constraintName"),
  };
}

export function parseDropForeignKeyPayload(value: unknown): {
  schema: string;
  table: string;
  constraintName: string;
} {
  if (!isRecord(value)) throw new SchemaValidationError("Request body must be a JSON object.");
  assertAllowedKeys(value, ["schema", "table", "constraintName"], "request");
  return {
    schema: validateSchemaIdentifier(value.schema, "schema"),
    table: validateSchemaIdentifier(value.table, "table"),
    constraintName: validateSchemaIdentifier(value.constraintName, "constraintName"),
  };
}
