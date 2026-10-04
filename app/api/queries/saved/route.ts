import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured, query } from "@/lib/db/client";
import {
  MAX_SAVED_QUERIES,
  MAX_SQL_BYTES,
  QueryRequestError,
  parseSavedQueryPayload,
  readJsonBody,
} from "@/lib/queries/query-policy";
import { savedQueryListStatement } from "@/lib/queries/persistence-queries";
import { logAuditEvent } from "@/lib/audit/log";

interface SavedQueryRow {
  id: string;
  name: string;
  sql: string;
  created_at: Date | string;
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const statement = savedQueryListStatement(user.id);
    const saved = await query<SavedQueryRow>(statement.text, statement.values);
    return NextResponse.json({ ok: true, saved });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load saved queries. Check that the application database migration has been applied." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const payload = parseSavedQueryPayload(await readJsonBody(req, MAX_SQL_BYTES + 4_096));
    const count = await query<{ count: string }>(
      `select count(*)::text as count from protodb_admin.saved_queries where user_id = $1`,
      [user.id]
    );
    if (Number(count[0]?.count ?? 0) >= MAX_SAVED_QUERIES) {
      throw new QueryRequestError(`Each account may save up to ${MAX_SAVED_QUERIES} queries.`, 409);
    }
    const rows = await query<SavedQueryRow>(
      `insert into protodb_admin.saved_queries (user_id, name, sql)
       values ($1, $2, $3)
       returning id, name, sql, created_at`,
      [user.id, payload.name, payload.sql]
    );
    // Saved-query SQL text is per-user private content; audit only the
    // mutation metadata (id), never the raw SQL, consistent with sql.execute.
    await logAuditEvent({
      actor: user.email,
      action: "sql.saved_query.create",
      resource: `Saved query ${rows[0]?.id ?? "unknown"}`,
      result: "success",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({ ok: true, saved: rows[0] }, { status: 201 });
  } catch (error) {
    if (!(error instanceof QueryRequestError)) console.error("Failed to save SQL Editor query:", error);
    const status = error instanceof QueryRequestError ? error.status : 500;
    await logAuditEvent({
      actor: user.email,
      action: "sql.saved_query.create",
      resource: "Saved query",
      result: "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json(
      { ok: false, error: error instanceof QueryRequestError ? error.message : "Could not save the query." },
      { status }
    );
  }
}
