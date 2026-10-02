import { NextRequest, NextResponse } from "next/server";
import { canWriteStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { storageErrorResponse } from "@/lib/storage/http";
import { finalizeUpload } from "@/lib/storage/service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!canWriteStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.upload.finalize", resource: `Storage upload ${id}`, result: "failed" });
    return NextResponse.json({ ok: false, error: "Your role is read-only for Storage objects." }, { status: 403 });
  }
  try {
    const object = await finalizeUpload(id, user.id);
    await logAuditEvent({ actor: user.email, action: "storage.upload", resource: `Storage object ${object.id}`, result: "success" });
    return NextResponse.json({ ok: true, object });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.upload.finalize", resource: "Storage object", result: "failed" });
    return storageErrorResponse(error, "Could not finalize Storage upload.");
  }
}
