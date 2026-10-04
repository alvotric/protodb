import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { createForeignKey, dropForeignKey, replaceForeignKey } from "@/lib/database/ddl-service";
import { listForeignKeys } from "@/lib/database/schema-service";
import { safeDbMutationError, safeDbReadError } from "@/lib/database/db-error";
import {
  parseDropForeignKeyPayload,
  parseForeignKeyPayload,
  SchemaValidationError,
} from "@/lib/database/schema-validation";
import { logAuditEvent } from "@/lib/audit/log";

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const foreignKeys = await listForeignKeys();
    return NextResponse.json({ ok: true, foreignKeys });
  } catch (err) {
    return safeDbReadError(err, "Failed to list foreign keys.");
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canManageSchema(user)) {
    return NextResponse.json({ ok: false, error: schemaMutationDeniedResponse(user) }, { status: 403 });
  }
  if (!isDdlDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Schema changes are disabled until DATABASE_DDL_URL is configured." }, { status: 503 });
  }

  let payload: ReturnType<typeof parseForeignKeyPayload>;
  try {
    payload = parseForeignKeyPayload(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Invalid request.", field: err instanceof SchemaValidationError ? err.field : undefined },
      { status: 400 }
    );
  }

  const resource = `${payload.schema}.${payload.table}.${payload.constraintName}`;
  const ip = req.headers.get("x-forwarded-for") ?? "—";
  try {
    await createForeignKey(payload);
    await logAuditEvent({ actor: user.email, action: "schema.create_foreign_key", resource, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.create_foreign_key", resource, result: "failed", ip });
    return safeDbMutationError(err, "Failed to create the foreign key.");
  }
}

export async function PATCH(req: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canManageSchema(user)) {
    return NextResponse.json({ ok: false, error: schemaMutationDeniedResponse(user) }, { status: 403 });
  }
  if (!isDdlDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Schema changes are disabled until DATABASE_DDL_URL is configured." }, { status: 503 });
  }

  let payload: ReturnType<typeof parseForeignKeyPayload>;
  try {
    payload = parseForeignKeyPayload(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Invalid request.", field: err instanceof SchemaValidationError ? err.field : undefined },
      { status: 400 }
    );
  }

  const resource = `${payload.schema}.${payload.table}.${payload.constraintName}`;
  const ip = req.headers.get("x-forwarded-for") ?? "—";
  try {
    await replaceForeignKey(payload);
    await logAuditEvent({ actor: user.email, action: "schema.edit_foreign_key", resource, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.edit_foreign_key", resource, result: "failed", ip });
    return safeDbMutationError(err, "Failed to update the foreign key.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canManageSchema(user)) {
    return NextResponse.json({ ok: false, error: schemaMutationDeniedResponse(user) }, { status: 403 });
  }
  if (!isDdlDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Schema changes are disabled until DATABASE_DDL_URL is configured." }, { status: 503 });
  }

  let payload: ReturnType<typeof parseDropForeignKeyPayload>;
  try {
    payload = parseDropForeignKeyPayload(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Invalid request.", field: err instanceof SchemaValidationError ? err.field : undefined },
      { status: 400 }
    );
  }

  const resource = `${payload.schema}.${payload.table}.${payload.constraintName}`;
  const ip = req.headers.get("x-forwarded-for") ?? "—";
  try {
    await dropForeignKey(payload.schema, payload.table, payload.constraintName);
    await logAuditEvent({ actor: user.email, action: "schema.drop_foreign_key", resource, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.drop_foreign_key", resource, result: "failed", ip });
    return safeDbMutationError(err, "Failed to remove the foreign key.");
  }
}
