import { NextRequest, NextResponse } from "next/server";
import { canExecuteSql, sqlExecutionDeniedResponse } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";
import { isDatabaseConfigured, query } from "@/lib/db/client";
import {
  MAX_SQL_BYTES,
  QUERY_HISTORY_LIMIT,
  QUERY_CONCURRENCY_LIMIT,
  QUERY_PER_USER_LIMIT,
  QueryRequestError,
  acquireQuerySlot,
  readJsonBody,
  validateSqlText,
} from "@/lib/queries/query-policy";
import { executeSql } from "@/lib/queries/query-service";
import type { QueryOutcome } from "@/lib/queries/types";

interface ExecutionRequest {
  sql: string;
}

function parseExecutionRequest(value: unknown): ExecutionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QueryRequestError("Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "sql")) {
    throw new QueryRequestError("Only the sql field is accepted.");
  }
  return { sql: validateSqlText(body.sql) };
}

async function persistHistory(
  userId: string,
  sql: string,
  outcome: QueryOutcome
): Promise<boolean> {
  await query(
    `with inserted as (
       insert into protodb_admin.query_history
         (user_id, sql, status, row_count, duration_ms, error_message, error_position)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id
     )
     delete from protodb_admin.query_history
     where user_id = $1
       and id not in (
         select id from protodb_admin.query_history
         where user_id = $1
         order by created_at desc, id desc
         limit $8
       )`,
    [
      userId,
      sql,
      outcome.ok ? "success" : "error",
      outcome.ok ? outcome.rowCount : null,
      outcome.durationMs,
      outcome.ok ? null : outcome.message,
      outcome.ok ? null : outcome.position ?? null,
      QUERY_HISTORY_LIMIT,
    ]
  );
  return true;
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canExecuteSql(user)) {
    await logAuditEvent({ actor: user.email, action: "sql.execute", resource: "SQL Editor", result: "failed" });
    return NextResponse.json({ ok: false, error: sqlExecutionDeniedResponse(user) }, { status: 403 });
  }

  let sql: string;
  try {
    sql = parseExecutionRequest(await readJsonBody(req, MAX_SQL_BYTES + 4_096)).sql;
  } catch (error) {
    const status = error instanceof QueryRequestError ? error.status : 400;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request." },
      { status }
    );
  }

  const releaseSlot = acquireQuerySlot(user.id);
  if (!releaseSlot) {
    return NextResponse.json(
      { ok: false, error: `SQL execution is busy. At most ${QUERY_CONCURRENCY_LIMIT} statements run concurrently per server process (${QUERY_PER_USER_LIMIT} per account). Please wait and retry.` },
      { status: 429 }
    );
  }

  try {
    const outcome = await executeSql(sql);
    await logAuditEvent({
      actor: user.email,
      action: "sql.execute",
      resource: `SQL Editor (${outcome.durationMs}ms)`,
      result: outcome.ok ? "success" : "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });

    let historySaved = false;
    try {
      historySaved = await persistHistory(user.id, sql, outcome);
    } catch (error) {
      console.error("Failed to persist SQL Editor history:", error);
    }

    return NextResponse.json({
      ok: true,
      outcome,
      historySaved,
      ...(historySaved ? {} : { historyWarning: "The query ran, but its history entry could not be saved." }),
    }, { status: outcome.ok ? 200 : 400 });
  } finally {
    releaseSlot();
  }
}
