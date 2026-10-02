import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { createTable } from "@/lib/database/ddl-service";
import { parseCreateTablePayload, SchemaValidationError } from "@/lib/database/schema-validation";
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

  let payload: ReturnType<typeof parseCreateTablePayload>;
  try {
    payload = parseCreateTablePayload(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Invalid request body.", field: err instanceof SchemaValidationError ? err.field : undefined },
      { status: 400 }
    );
  }

  try {
    await createTable(payload.schema, payload.table, payload.columns);
    await logAuditEvent({ actor: user.email, action: "schema.create_table", resource: `${payload.schema}.${payload.table}`, result: "success", ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "schema.create_table", resource: `${payload.schema}.${payload.table}`, result: "failed", ip: clientIp(req) });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to create table." },
      { status: 500 }
    );
  }
}
