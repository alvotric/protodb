import { NextRequest, NextResponse } from "next/server";
import { canManageStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { readStorageJson, rejectUnknownFields, storageErrorResponse } from "@/lib/storage/http";
import { updateBucketSettings } from "@/lib/storage/service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!canManageStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.bucket.settings", resource: `Storage bucket ${id}`, result: "failed" });
    return NextResponse.json({ ok: false, error: "Owner or Admin access is required to change bucket settings." }, { status: 403 });
  }
  try {
    const body = await readStorageJson(request);
    rejectUnknownFields(body, ["isPublic", "sizeLimitBytes"]);
    const bucket = await updateBucketSettings(id, {
      isPublic: body.isPublic,
      sizeLimitBytes: body.sizeLimitBytes,
    });
    await logAuditEvent({ actor: user.email, action: "storage.bucket.settings", resource: `Storage bucket ${id}`, result: "success" });
    return NextResponse.json({ ok: true, bucket });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.bucket.settings", resource: `Storage bucket ${id}`, result: "failed" });
    return storageErrorResponse(error, "Could not update Storage bucket settings.");
  }
}
