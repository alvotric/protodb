import { NextRequest, NextResponse } from "next/server";
import { canWriteStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { cancelUpload } from "@/lib/storage/service";
import { storageErrorResponse } from "@/lib/storage/http";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!canWriteStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.upload.cancel", resource: `Storage upload ${id}`, result: "failed" });
    return NextResponse.json({ ok: false, error: "Your role is read-only for Storage objects." }, { status: 403 });
  }
  try {
    await cancelUpload(id, user.id);
    await logAuditEvent({ actor: user.email, action: "storage.upload.cancel", resource: `Storage upload ${id}`, result: "success" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.upload.cancel", resource: `Storage upload ${id}`, result: "failed" });
    return storageErrorResponse(error, "Could not cancel Storage upload.");
  }
}
