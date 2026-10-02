import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAddColumnPayload,
  parseColumnPatchPayload,
  parseCreateTablePayload,
  parseForeignKeyPayload,
  renderColumnDefaultSql,
  validateColumnDefault,
  validateSchemaIdentifier,
} from "../lib/database/schema-validation.ts";
import { groupForeignKeyMetadata } from "../lib/database/foreign-key-metadata.ts";

test("accepts supported identifiers and rejects unsafe or truncated names", () => {
  assert.equal(validateSchemaIdentifier("sales_2026", "schema"), "sales_2026");
  assert.throws(() => validateSchemaIdentifier("sales;drop", "schema"), /valid PostgreSQL identifier/);
  assert.throws(() => validateSchemaIdentifier("x".repeat(64), "schema"), /max 63 characters/);
});

test("create-table payload requires one unique, well-typed PK column at most", () => {
  const parsed = parseCreateTablePayload({
    schema: "sales",
    table: "orders",
    columns: [
      { name: "id", type: "uuid", nullable: false, isPrimaryKey: true },
      { name: "label", type: "text", nullable: true },
    ],
  });
  assert.equal(parsed.columns.length, 2);
  assert.throws(() => parseCreateTablePayload({
    schema: "sales",
    table: "orders",
    columns: [
      { name: "id", type: "uuid", nullable: false, isPrimaryKey: true },
      { name: "id", type: "text", nullable: true },
    ],
  }), /listed more than once/);
  assert.throws(() => parseCreateTablePayload({
    schema: "sales",
    table: "orders",
    columns: [
      { name: "id", type: "uuid", nullable: false, isPrimaryKey: true },
      { name: "other_id", type: "uuid", nullable: false, isPrimaryKey: true },
    ],
  }), /composite primary keys are not available/);
  assert.throws(() => parseCreateTablePayload({
    schema: "sales",
    table: "orders",
    columns: [{ name: "id", type: "uuid", nullable: true, isPrimaryKey: true }],
  }), /primary-key column must be non-nullable/);
});

test("add-column rejects non-boolean nullable values instead of coercing them", () => {
  assert.throws(
    () => parseAddColumnPayload({ name: "active", type: "boolean", nullable: "false" }),
    /nullable must be a boolean/
  );
  assert.equal(parseAddColumnPayload({ name: "active", type: "boolean", nullable: false }).nullable, false);
});

test("column type and payload fields are allow-listed", () => {
  assert.throws(() => parseAddColumnPayload({ name: "value", type: "text); drop table x", nullable: true }), /must be one of/);
  assert.throws(() => parseAddColumnPayload({ name: "value", type: "text", nullable: true, sql: "drop table x" }), /Unexpected field/);
});

test("defaults preserve literal/expression distinction and validate values", () => {
  assert.deepEqual(validateColumnDefault({ kind: "literal", value: "hello ' world" }, "text"), {
    kind: "literal",
    value: "hello ' world",
  });
  assert.deepEqual(validateColumnDefault({ kind: "expression", value: "gen_random_uuid()" }, "uuid"), {
    kind: "expression",
    value: "gen_random_uuid()",
  });
  assert.throws(() => validateColumnDefault({ kind: "expression", value: "now(); drop table x" }, "timestamptz"), /not supported/);
  assert.throws(() => validateColumnDefault({ kind: "literal", value: "12x" }, "integer"), /32-bit integer/);
  assert.throws(() => validateColumnDefault({ kind: "literal", value: "{bad json" }, "jsonb"), /valid JSON/);
  assert.equal(
    renderColumnDefaultSql({ kind: "literal", value: "x'; drop table users; --" }, "text"),
    "E'x''; drop table users; --'::text"
  );
  assert.equal(
    renderColumnDefaultSql({ kind: "literal", value: "4.25" }, "numeric"),
    "4.25"
  );
});

test("column edits require exactly one recognized operation", () => {
  assert.deepEqual(parseColumnPatchPayload({ nullable: false }), { nullable: false });
  assert.throws(() => parseColumnPatchPayload({ nullable: "false" }), /nullable/);
  assert.throws(() => parseColumnPatchPayload({ newName: "renamed", newType: "text" }), /exactly one/);
  assert.deepEqual(parseColumnPatchPayload({ defaultValue: null }), { defaultValue: null });
});

test("foreign-key mutation payload validates every identifier", () => {
  const fk = parseForeignKeyPayload({
    schema: "sales",
    table: "orders",
    column: "customer_id",
    refSchema: "crm",
    refTable: "customers",
    refColumn: "id",
    constraintName: "orders_customer_fk",
  });
  assert.equal(fk.refSchema, "crm");
  assert.throws(() => parseForeignKeyPayload({
    ...fk,
    constraintName: "fk; drop table orders",
  }), /valid PostgreSQL identifier/);
});

test("foreign-key metadata keeps same-named constraints isolated and pairs composite columns by ordinal", () => {
  const grouped = groupForeignKeyMetadata([
    {
      constraint_id: "20",
      schema: "orders",
      table: "line_items",
      constraint_name: "fk_parent",
      column: "parent_b",
      ref_schema: "catalog",
      ref_table: "parents",
      ref_column: "id_b",
      ordinal_position: 2,
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    {
      constraint_id: "10",
      schema: "orders",
      table: "line_items",
      constraint_name: "fk_parent",
      column: "parent_a",
      ref_schema: "catalog",
      ref_table: "parents",
      ref_column: "id_a",
      ordinal_position: 1,
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    {
      constraint_id: "20",
      schema: "orders",
      table: "line_items",
      constraint_name: "fk_parent",
      column: "parent_a",
      ref_schema: "catalog",
      ref_table: "parents",
      ref_column: "id_a",
      ordinal_position: 1,
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    {
      constraint_id: "30",
      schema: "sales",
      table: "line_items",
      constraint_name: "fk_parent",
      column: "parent_id",
      ref_schema: "catalog",
      ref_table: "parents",
      ref_column: "id",
      ordinal_position: 1,
      on_update: "RESTRICT",
      on_delete: "SET NULL",
    },
  ]);

  assert.equal(grouped.length, 3);
  const composite = grouped.find((foreignKey) => foreignKey.schema === "orders" && foreignKey.columns.length === 2);
  assert.deepEqual(composite?.columns, [
    { column: "parent_a", refColumn: "id_a" },
    { column: "parent_b", refColumn: "id_b" },
  ]);
  assert.equal(grouped.find((foreignKey) => foreignKey.schema === "sales")?.refSchema, "catalog");
});
