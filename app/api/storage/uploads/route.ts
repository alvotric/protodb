import { NextRequest, NextResponse } from "next/server";
import { canWriteStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { readStorageJson, rejectUnknownFields, storageErrorResponse } from "@/lib/storage/http";
import { initiateUpload } from "@/lib/storage/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canWriteStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.upload", resource: "Storage object", result: "failed" });
    return NextResponse.json({ ok: false, error: "Your role is read-only for Storage objects." }, { status: 403 });
  }
  try {
    const body = await readStorageJson(request);
    rejectUnknownFields(body, ["bucketId", "name", "folder", "contentType", "sizeBytes"]);
    const result = await initiateUpload({
      bucketId: body.bucketId,
      name: body.name,
      folder: body.folder,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
    }, user.id);
    await logAuditEvent({ actor: user.email, action: "storage.upload.initiate", resource: `Storage upload ${result.uploadId}`, result: "success" });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.upload.initiate", resource: "Storage object", result: "failed" });
    return storageErrorResponse(error, "Could not initiate Storage upload.");
  }
}
