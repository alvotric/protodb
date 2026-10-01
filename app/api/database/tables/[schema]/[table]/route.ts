import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { getTableColumns, getExactRowCount, tableExists } from "@/lib/database/schema-service";
import { dropTable } from "@/lib/database/ddl-service";
import { logAuditEvent } from "@/lib/audit/log";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") ?? "—";
}

export async function GET(_req: Request, { params }: { params: Promise<{ schema: string; table: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;

  try {
    if (!(await tableExists(schema, table))) {
      return NextResponse.json({ ok: false, error: `"${schema}.${table}" doesn't exist.` }, { status: 404 });
    }

    const [columns, rowCount] = await Promise.all([getTableColumns(schema, table), getExactRowCount(schema, table)]);

    return NextResponse.json({ ok: true, columns, rowCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load table detail." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ schema: string; table: string }> }) {
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

  try {
    await dropTable(schema, table);
    await logAuditEvent({ actor: user.email, action: "schema.drop_table", resource: `${schema}.${table}`, result: "success", ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.drop_table", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to drop table." },
      { status: 500 }
    );
  }
}
