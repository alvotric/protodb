import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { renameColumn, alterColumnType, setColumnNullable, dropColumn } from "@/lib/database/ddl-service";
import { logAuditEvent } from "@/lib/audit/log";

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

  const { schema, table, column } = await params;
  const body = await req.json().catch(() => null);
  const newName = typeof body?.newName === "string" ? body.newName : null;
  const newType = typeof body?.newType === "string" ? body.newType : null;
  const nullable = typeof body?.nullable === "boolean" ? body.nullable : null;

  const requestedChanges = [newName !== null, newType !== null, nullable !== null].filter(Boolean).length;
  if (requestedChanges !== 1) {
    return NextResponse.json(
      { ok: false, error: "Send exactly one column change per request: newName, newType, or nullable." },
      { status: 400 }
    );
  }

  const ip = clientIp(req);

  try {
    if (newType !== null) {
      await alterColumnType(schema, table, column, newType);
    } else if (nullable !== null) {
      await setColumnNullable(schema, table, column, nullable);
    } else if (newName !== null && newName !== column) {
      await renameColumn(schema, table, column, newName);
    } else {
      return NextResponse.json({ ok: false, error: "The new column value must differ from the current value." }, { status: 400 });
    }

    await logAuditEvent({
      actor: user.email,
      action: "schema.alter_column",
      resource: `${schema}.${table}.${column}`,
      result: "success",
      ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({
      actor: user.email,
      action: "schema.alter_column",
      resource: `${schema}.${table}.${column}`,
      result: "failed",
      ip,
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update column." },
      { status: 500 }
    );
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

  const { schema, table, column } = await params;
  const ip = clientIp(req);

  try {
    await dropColumn(schema, table, column);
    await logAuditEvent({ actor: user.email, action: "schema.drop_column", resource: `${schema}.${table}.${column}`, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.drop_column", resource: `${schema}.${table}.${column}`, result: "failed", ip });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to drop column." },
      { status: 500 }
    );
  }
}
