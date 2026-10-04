import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isDdlDatabaseConfigured } from "@/lib/db/ddl-client";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageSchema, schemaMutationDeniedResponse } from "@/lib/auth/authorization";
import { setSingleColumnPrimaryKey } from "@/lib/database/ddl-service";
import { parsePrimaryKeyPayload, SchemaValidationError, validateSchemaIdentifier } from "@/lib/database/schema-validation";
import { safeDbMutationError } from "@/lib/database/db-error";
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

  let schema: string;
  let table: string;
  let payload: ReturnType<typeof parsePrimaryKeyPayload>;
  try {
    const routeParams = await params;
    schema = validateSchemaIdentifier(routeParams.schema, "schema");
    table = validateSchemaIdentifier(routeParams.table, "table");
    payload = parsePrimaryKeyPayload(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Invalid request.", field: err instanceof SchemaValidationError ? err.field : undefined },
      { status: 400 }
    );
  }

  const ip = req.headers.get("x-forwarded-for") ?? "—";
  const action = payload.enabled ? "schema.add_primary_key" : "schema.drop_primary_key";
  try {
    await setSingleColumnPrimaryKey(schema, table, payload.column, payload.enabled);
    await logAuditEvent({ actor: user.email, action, resource: `${schema}.${table}.${payload.column}`, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action, resource: `${schema}.${table}.${payload.column}`, result: "failed", ip });
    return safeDbMutationError(err, "Failed to update the primary key.");
  }
}
