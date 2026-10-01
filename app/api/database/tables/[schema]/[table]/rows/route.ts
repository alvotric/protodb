import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { tableExists } from "@/lib/database/schema-service";
import {
  getTableRows,
  updateTableRow,
  insertTableRow,
  deleteTableRows,
  TableDataValidationError,
  type TableFilter,
} from "@/lib/database/table-data-service";
import { logAuditEvent } from "@/lib/audit/log";
import { canMutateTableData, tableDataMutationDeniedResponse } from "@/lib/auth/authorization";

type RouteParams = { params: Promise<{ schema: string; table: string }> };

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") ?? "—";
}

async function denyMutation(req: NextRequest, user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, schema: string, table: string) {
  const error = tableDataMutationDeniedResponse(user);
  await logAuditEvent({
    actor: user.email,
    action: "table.mutation_denied",
    resource: `${schema}.${table}`,
    result: "failed",
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: false, error }, { status: 403 });
}

function errorResponse(err: unknown, fallback: string) {
  const validation = err instanceof TableDataValidationError;
  const postgresCode =
    typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
      ? err.code
      : "";
  const databaseConstraintError = postgresCode.startsWith("22") || postgresCode.startsWith("23");
  return NextResponse.json(
    {
      ok: false,
      error: validation
        ? err.message
        : databaseConstraintError
          ? "PostgreSQL rejected the value because of a type or table constraint."
          : err instanceof Error
            ? err.message
            : fallback,
    },
    { status: validation || databaseConstraintError ? 400 : 500 }
  );
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

    const rawFilters = url.searchParams.get("filters");
    let filters: TableFilter[] | undefined;
    if (rawFilters) {
      try {
        const parsed: unknown = JSON.parse(rawFilters);
        if (!Array.isArray(parsed)) throw new Error();
        filters = parsed as TableFilter[];
      } catch {
        return NextResponse.json({ ok: false, error: "The filters parameter must be a JSON array." }, { status: 400 });
      }
    }

    const result = await getTableRows(schema, table, {
      page: parseInt(url.searchParams.get("page") ?? "0", 10),
      pageSize: parseInt(url.searchParams.get("pageSize") ?? "25", 10),
      sortColumn: url.searchParams.get("sortColumn") ?? undefined,
      sortDir: url.searchParams.get("sortDir") === "desc" ? "desc" : "asc",
      filters,
      filterColumn: url.searchParams.get("filterColumn") ?? undefined,
      filterValue: url.searchParams.get("filterValue") ?? undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err, "Failed to load rows.");
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;
  if (!canMutateTableData(user)) return denyMutation(req, user, schema, table);
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "A JSON object is required." }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const primaryKeyColumn = typeof payload.primaryKeyColumn === "string" ? payload.primaryKeyColumn : "";
  const primaryKeyValue = payload.primaryKeyValue;
  const changes =
    payload.changes && typeof payload.changes === "object"
      ? payload.changes as Record<string, unknown>
      : null;

  if (!primaryKeyColumn || primaryKeyValue === undefined || !changes) {
    return NextResponse.json({ ok: false, error: "primaryKeyColumn, primaryKeyValue, and changes are required." }, { status: 400 });
  }

  try {
    if (!(await tableExists(schema, table))) {
      return NextResponse.json({ ok: false, error: `"${schema}.${table}" doesn't exist.` }, { status: 404 });
    }
    const updated = await updateTableRow(schema, table, primaryKeyColumn, primaryKeyValue, changes);
    if (!updated) {
      await logAuditEvent({ actor: user.email, action: "table.update_row", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
      return NextResponse.json({ ok: false, error: "The row was not found." }, { status: 404 });
    }
    await logAuditEvent({ actor: user.email, action: "table.update_row", resource: `${schema}.${table}`, result: "success", ip: clientIp(req) });
    return NextResponse.json({ ok: true, row: updated });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "table.update_row", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
    return errorResponse(err, "Failed to update row.");
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;
  if (!canMutateTableData(user)) return denyMutation(req, user, schema, table);
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "A JSON object is required." }, { status: 400 });
  }
  const values = body as Record<string, unknown>;

  try {
    if (!(await tableExists(schema, table))) {
      return NextResponse.json({ ok: false, error: `"${schema}.${table}" doesn't exist.` }, { status: 404 });
    }
    const created = await insertTableRow(schema, table, values);
    await logAuditEvent({ actor: user.email, action: "table.insert_row", resource: `${schema}.${table}`, result: "success", ip: clientIp(req) });
    return NextResponse.json({ ok: true, row: created });
  } catch (err) {
    await logAuditEvent({ actor: user.email, action: "table.insert_row", resource: `${schema}.${table}`, result: "failed", ip: clientIp(req) });
    return errorResponse(err, "Failed to insert row.");
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { schema, table } = await params;
  if (!canMutateTableData(user)) return denyMutation(req, user, schema, table);
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "A JSON object is required." }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const primaryKeyColumn = typeof payload.primaryKeyColumn === "string" ? payload.primaryKeyColumn : "";
  const primaryKeyValues = Array.isArray(payload.primaryKeyValues) ? payload.primaryKeyValues : [];

  if (!primaryKeyColumn || primaryKeyValues.length === 0) {
    return NextResponse.json({ ok: false, error: "primaryKeyColumn and a non-empty primaryKeyValues array are required." }, { status: 400 });
  }

  try {
    if (!(await tableExists(schema, table))) {
      return NextResponse.json({ ok: false, error: `"${schema}.${table}" doesn't exist.` }, { status: 404 });
    }
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
    return errorResponse(err, "Failed to delete rows.");
  }
}
