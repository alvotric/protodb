import { NextRequest, NextResponse } from "next/server";
import { canWriteStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { readStorageJson, rejectUnknownFields, storageErrorResponse } from "@/lib/storage/http";
import { deleteObjects, renameObject } from "@/lib/storage/service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!canWriteStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.object.rename", resource: `Storage object ${id}`, result: "failed" });
    return NextResponse.json({ ok: false, error: "Your role is read-only for Storage objects." }, { status: 403 });
  }
  try {
    const body = await readStorageJson(request);
    rejectUnknownFields(body, ["name", "folder"]);
    const object = await renameObject(id, body.name, body.folder);
    await logAuditEvent({ actor: user.email, action: "storage.object.rename", resource: `Storage object ${id}`, result: "success" });
    return NextResponse.json({ ok: true, object });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.object.rename", resource: `Storage object ${id}`, result: "failed" });
    return storageErrorResponse(error, "Could not rename Storage object.");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!canWriteStorage(user)) {
    await logAuditEvent({ actor: user.email, action: "storage.object.delete", resource: `Storage object ${id}`, result: "failed" });
    return NextResponse.json({ ok: false, error: "Your role is read-only for Storage objects." }, { status: 403 });
  }
  try {
    const result = await deleteObjects([id]);
    if (result.failed.length) throw new Error("Object deletion failed.");
    await logAuditEvent({ actor: user.email, action: "storage.object.delete", resource: `Storage object ${id}`, result: "success" });
    return NextResponse.json({ ok: true, deleted: result.deleted });
  } catch (error) {
    await logAuditEvent({ actor: user.email, action: "storage.object.delete", resource: `Storage object ${id}`, result: "failed" });
    return storageErrorResponse(error, "Could not delete Storage object.");
  }
}
