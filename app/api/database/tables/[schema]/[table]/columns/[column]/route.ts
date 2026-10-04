import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { renameColumn, alterColumnType, setColumnNullable, setColumnDefault, dropColumn } from "@/lib/database/ddl-service";
import { safeDbMutationError } from "@/lib/database/db-error";
import { logAuditEvent } from "@/lib/audit/log";
import {
  parseColumnPatchPayload,
  SchemaValidationError,
  validateSchemaIdentifier,
} from "@/lib/database/schema-validation";

type RouteParams = { params: Promise<{ schema: string; table: string; column: string }> };

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") ?? "—";
}

/**
 * Phase 10 — Backend API & Real Data Integration (Part 3).
 * One column, exactly one real ALTER TABLE operation per request.
 * Rename, retype, and nullable changes are deliberately kept as
 * separate API calls so one failed schema operation cannot leave a
 * multi-step request partially applied.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canManageSchema(user)) {
    return NextResponse.json({ ok: false, error: schemaMutationDeniedResponse(user) }, { status: 403 });
  }
  if (!isDdlDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Schema changes are disabled until DATABASE_DDL_URL is configured." }, { status: 503 });
  }

  let schema: string;
  let table: string;
  let column: string;
  let change: ReturnType<typeof parseColumnPatchPayload>;
  try {
    const routeParams = await params;
    schema = validateSchemaIdentifier(routeParams.schema, "schema");
    table = validateSchemaIdentifier(routeParams.table, "table");
    column = validateSchemaIdentifier(routeParams.column, "column");
    change = parseColumnPatchPayload(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid request.",
        field: err instanceof SchemaValidationError ? err.field : undefined,
      },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const action = "newName" in change
    ? "schema.rename_column"
    : "newType" in change
      ? "schema.alter_column_type"
      : "nullable" in change
        ? "schema.alter_column_nullable"
        : "schema.alter_column_default";

  try {
    if ("newType" in change) {
      await alterColumnType(schema, table, column, change.newType);
    } else if ("nullable" in change) {
      await setColumnNullable(schema, table, column, change.nullable);
    } else if ("newName" in change) {
      if (change.newName === column) {
        return NextResponse.json({ ok: false, error: "The new column value must differ from the current value." }, { status: 400 });
      }
      await renameColumn(schema, table, column, change.newName);
    } else {
      await setColumnDefault(schema, table, column, change.defaultValue);
    }

    await logAuditEvent({
      actor: user.email,
      action,
      resource: `${schema}.${table}.${column}`,
      result: "success",
      ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({
      actor: user.email,
      action,
      resource: `${schema}.${table}.${column}`,
      result: "failed",
      ip,
    });
    return safeDbMutationError(err, "Failed to update column.");
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canManageSchema(user)) {
    return NextResponse.json({ ok: false, error: schemaMutationDeniedResponse(user) }, { status: 403 });
  }
  if (!isDdlDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Schema changes are disabled until DATABASE_DDL_URL is configured." }, { status: 503 });
  }

  let schema: string;
  let table: string;
  let column: string;
  try {
    const routeParams = await params;
    schema = validateSchemaIdentifier(routeParams.schema, "schema");
    table = validateSchemaIdentifier(routeParams.table, "table");
    column = validateSchemaIdentifier(routeParams.column, "column");
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Invalid path identifier.", field: err instanceof SchemaValidationError ? err.field : undefined },
      { status: 400 }
    );
  }
  const ip = clientIp(req);

  try {
    await dropColumn(schema, table, column);
    await logAuditEvent({ actor: user.email, action: "schema.drop_column", resource: `${schema}.${table}.${column}`, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.drop_column", resource: `${schema}.${table}.${column}`, result: "failed", ip });
    return safeDbMutationError(err, "Failed to drop column.");
  }
}
