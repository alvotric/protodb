import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { AuditQueryError, canReadAudit, parseAuditQuery } from "@/lib/audit/audit-query";
import { readAuditPage } from "@/lib/audit/audit-read-service";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "database_unavailable", message: "The audit database is not configured." } },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Not signed in." } }, { status: 401 });
  }
  if (!canReadAudit(user.role)) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Owner or Admin access is required to read audit history." } },
      { status: 403 }
    );
  }

  let filters;
  try {
    filters = parseAuditQuery(new URL(request.url).searchParams);
  } catch (error) {
    if (error instanceof AuditQueryError) {
      return NextResponse.json(
        { ok: false, error: { code: "invalid_query", message: error.message } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "invalid_query", message: "Audit filters are invalid." } },
      { status: 400 }
    );
  }

  try {
    const result = await readAuditPage(filters);
    return NextResponse.json({
      ok: true,
      source: "protodb_admin.audit_log",
      events: result.events,
      page: filters.page,
      pageSize: filters.pageSize,
      total: result.total,
    });
  } catch (error) {
    console.error("Failed to read audit records:", error);
    return NextResponse.json(
      { ok: false, error: { code: "audit_unavailable", message: "Audit history is temporarily unavailable." } },
      { status: 503 }
    );
  }
}
