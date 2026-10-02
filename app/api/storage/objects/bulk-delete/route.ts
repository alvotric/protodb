import { NextRequest, NextResponse } from "next/server";
import { canWriteStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { readStorageJson, rejectUnknownFields, storageErrorResponse } from "@/lib/storage/http";
import { deleteObjects } from "@/lib/storage/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canWriteStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.object.bulk_delete", resource: "Storage objects", result: "failed" });
    return NextResponse.json({ ok: false, error: "Your role is read-only for Storage objects." }, { status: 403 });
  }
  try {
    const body = await readStorageJson(request);
    rejectUnknownFields(body, ["ids"]);
    const result = await deleteObjects(body.ids);
    await logAuditEvent({
      actor: user.email,
      action: "storage.object.bulk_delete",
      resource: `Storage objects deleted (${result.deleted.length}); failed (${result.failed.length})`,
      result: result.failed.length ? "failed" : "success",
    });
    return NextResponse.json({ ok: result.failed.length === 0, ...result }, {
      status: result.failed.length ? 207 : 200,
    });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.object.bulk_delete", resource: "Storage objects", result: "failed" });
    return storageErrorResponse(error, "Could not delete selected Storage objects.");
  }
}
