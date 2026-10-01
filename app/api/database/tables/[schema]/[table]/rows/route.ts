import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { tableExists } from "@/lib/database/schema-service";
import { getTableRows, updateTableRow, insertTableRow, deleteTableRows } from "@/lib/database/table-data-service";
import { logAuditEvent } from "@/lib/audit/log";

type RouteParams = { params: Promise<{ schema: string; table: string }> };

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") ?? "—";
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;
  const url = new URL(req.url);

  try {
    if (!(await tableExists(schema, table))) {
      return NextResponse.json({ ok: false, error: `"${schema}.${table}" doesn't exist.` }, { status: 404 });
    }

    const result = await getTableRows(schema, table, {
      page: parseInt(url.searchParams.get("page") ?? "0", 10),
      pageSize: parseInt(url.searchParams.get("pageSize") ?? "25", 10),
      sortColumn: url.searchParams.get("sortColumn") ?? undefined,
      sortDir: url.searchParams.get("sortDir") === "desc" ? "desc" : "asc",
      filterColumn: url.searchParams.get("filterColumn") ?? undefined,
      filterValue: url.searchParams.get("filterValue") ?? undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load rows." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;
  const body = await req.json().catch(() => null);
  const primaryKeyColumn = typeof body?.primaryKeyColumn === "string" ? body.primaryKeyColumn : "";
  const primaryKeyValue = body?.primaryKeyValue;
  const changes = body?.changes && typeof body.changes === "object" ? body.changes : null;

  if (!primaryKeyColumn || primaryKeyValue === undefined || !changes) {
    return NextResponse.json({ ok: false, error: "primaryKeyColumn, primaryKeyValue, and changes are required." }, { status: 400 });
  }

  try {
    const updated = await updateTableRow(schema, table, primaryKeyColumn, primaryKeyValue, changes);
    await logAuditEvent({ actor: user.email, action: "table.update_row", resource: `${schema}.${table}`, result: "success", ip: clientIp(req) });
    return NextResponse.json({ ok: true, row: updated });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "table.update_row", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update row." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;
  const body = await req.json().catch(() => ({}));
  const values = body && typeof body === "object" ? body : {};

  try {
    const created = await insertTableRow(schema, table, values);
    await logAuditEvent({ actor: user.email, action: "table.insert_row", resource: `${schema}.${table}`, result: "success", ip: clientIp(req) });
    return NextResponse.json({ ok: true, row: created });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "table.insert_row", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to insert row." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;
  const body = await req.json().catch(() => null);
  const primaryKeyColumn = typeof body?.primaryKeyColumn === "string" ? body.primaryKeyColumn : "";
  const primaryKeyValues = Array.isArray(body?.primaryKeyValues) ? body.primaryKeyValues : [];

  if (!primaryKeyColumn || primaryKeyValues.length === 0) {
    return NextResponse.json({ ok: false, error: "primaryKeyColumn and a non-empty primaryKeyValues array are required." }, { status: 400 });
  }

  try {
    const deletedCount = await deleteTableRows(schema, table, primaryKeyColumn, primaryKeyValues);
    await logAuditEvent({
      actor: user.email,
      action: "table.delete_rows",
      resource: `${schema}.${table} (${deletedCount})`,
      result: "success",
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true, deletedCount });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "table.delete_rows", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete rows." },
      { status: 500 }
    );
  }
}
