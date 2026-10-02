import { NextRequest, NextResponse } from "next/server";
import { canManageStorage, canReadStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { readStorageJson, rejectUnknownFields, storageErrorResponse } from "@/lib/storage/http";
import { checkStorageProvider, cleanDeletingObjects, cleanExpiredUploads, createBucket, listBuckets } from "@/lib/storage/service";

export const runtime = "nodejs";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for") ?? "—";
}

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canReadStorage(user)) return NextResponse.json({ ok: false, error: "Storage access is not allowed." }, { status: 403 });
  try {
    await checkStorageProvider();
    await cleanExpiredUploads();
    await cleanDeletingObjects();
    return NextResponse.json({ ok: true, buckets: await listBuckets() });
  } catch (error) {
    return storageErrorResponse(error, "Could not load Storage buckets.");
  }
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canManageStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.bucket.create", resource: "Storage bucket", result: "failed", ip: clientIp(request) });
    return NextResponse.json({ ok: false, error: "Owner or Admin access is required to create buckets." }, { status: 403 });
  }
  try {
    const body = await readStorageJson(request);
    rejectUnknownFields(body, ["name", "displayName"]);
    const bucket = await createBucket({ name: body.name, displayName: body.displayName }, user.id);
    await logAuditEvent({ actor: user.email, action: "storage.bucket.create", resource: `Storage bucket ${bucket.id}`, result: "success", ip: clientIp(request) });
    return NextResponse.json({ ok: true, bucket }, { status: 201 });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.bucket.create", resource: "Storage bucket", result: "failed", ip: clientIp(request) });
    return storageErrorResponse(error, "Could not create Storage bucket.");
  }
}
