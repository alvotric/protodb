import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured, query } from "@/lib/db/client";
import { parseSavedQueryId, QueryRequestError } from "@/lib/queries/query-policy";
import { savedQueryDeleteStatement } from "@/lib/queries/persistence-queries";
import { logAuditEvent } from "@/lib/audit/log";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const { id: rawId } = await params;
    const id = parseSavedQueryId(rawId);
    const statement = savedQueryDeleteStatement(id, user.id);
    const rows = await query(statement.text, statement.values);
    if (rows.length === 0) {
      await logAuditEvent({
        actor: user.email,
        action: "sql.saved_query.delete",
        resource: `Saved query ${id}`,
        result: "failed",
        ip: req.headers.get("x-forwarded-for") ?? "—",
      });
      return NextResponse.json({ ok: false, error: "Saved query not found." }, { status: 404 });
    }
    await logAuditEvent({
      actor: user.email,
      action: "sql.saved_query.delete",
      resource: `Saved query ${id}`,
      result: "success",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (!(error instanceof QueryRequestError)) console.error("Failed to delete SQL Editor saved query:", error);
    const status = error instanceof QueryRequestError ? error.status : 500;
    await logAuditEvent({
      actor: user.email,
      action: "sql.saved_query.delete",
      resource: "Saved query",
      result: "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return NextResponse.json(
      { ok: false, error: error instanceof QueryRequestError ? error.message : "Could not delete the saved query." },
      { status }
    );
  }
}
