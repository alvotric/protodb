import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { createTable, type NewColumnSpec } from "@/lib/database/ddl-service";
import { logAuditEvent } from "@/lib/audit/log";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") ?? "—";
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

  const body = await req.json().catch(() => null);
  const schema = typeof body?.schema === "string" ? body.schema : "public";
  const table = typeof body?.table === "string" ? body.table : "";
  const columns: NewColumnSpec[] = Array.isArray(body?.columns) ? body.columns : [];

  if (!table || columns.length === 0) {
    return NextResponse.json({ ok: false, error: "A table name and at least one column are required." }, { status: 400 });
  }

  try {
    await createTable(schema, table, columns);
    await logAuditEvent({ actor: user.email, action: "schema.create_table", resource: `${schema}.${table}`, result: "success", ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.create_table", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to create table." },
      { status: 500 }
    );
  }
}
