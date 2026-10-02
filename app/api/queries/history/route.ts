import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured, query } from "@/lib/db/client";
import { QUERY_HISTORY_LIMIT } from "@/lib/queries/query-policy";
import { queryHistoryListStatement } from "@/lib/queries/persistence-queries";
import type { QueryHistoryRecord } from "@/lib/queries/types";

interface HistoryRow {
  id: string;
  sql: string;
  status: "success" | "error";
  row_count: number | null;
  duration_ms: number;
  error_message: string | null;
  error_position: number | null;
  created_at: Date | string;
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const statement = queryHistoryListStatement(user.id, QUERY_HISTORY_LIMIT);
    const rows = await query<HistoryRow>(statement.text, statement.values);
    const history: QueryHistoryRecord[] = rows.map((row) => ({
      id: row.id,
      sql: row.sql,
      status: row.status,
      rows: row.row_count,
      durationMs: row.duration_ms,
      error: row.error_message,
      errorPosition: row.error_position,
      ranAt: new Date(row.created_at).toISOString(),
    }));
    return NextResponse.json({ ok: true, history });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load query history. Check that the Phase 6 migration has been applied." }, { status: 500 });
  }
}
