import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { addColumn } from "@/lib/database/ddl-service";
import { logAuditEvent } from "@/lib/audit/log";

export async function POST(req: NextRequest, { params }: { params: Promise<{ schema: string; table: string }> }) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canManageSchema(user)) {
    return NextResponse.json({ ok: false, error: schemaMutationDeniedResponse(user) }, { status: 403 });
  }
  if (!isDdlDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Schema changes are disabled until DATABASE_DDL_URL is configured." }, { status: 503 });
  }

  const { schema, table } = await params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const type = typeof body?.type === "string" ? body.type : "";
  const nullable = Boolean(body?.nullable);

  if (!name || !type) {
    return NextResponse.json({ ok: false, error: "A column name and type are required." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "—";
  try {
    await addColumn(schema, table, { name, type, nullable });
    await logAuditEvent({ actor: user.email, action: "schema.add_column", resource: `${schema}.${table}.${name}`, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.add_column", resource: `${schema}.${table}.${name}`, result: "failed", ip });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to add column." },
      { status: 500 }
    );
  }
}
