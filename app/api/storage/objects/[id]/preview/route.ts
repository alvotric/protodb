import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { canReadStorage, MAX_STORAGE_PREVIEW_BYTES } from "@/lib/storage/policy";
import { readObjectPreview } from "@/lib/storage/service";
import { storageErrorResponse } from "@/lib/storage/http";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canReadStorage(user)) return NextResponse.json({ ok: false, error: "Storage access is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const result = await readObjectPreview(id);
    const body = result.bytes ?? new Uint8Array();
    const buffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(buffer).set(body);
    return new Response(buffer, {
      headers: {
        "Content-Type": result.contentType ?? "text/plain; charset=utf-8",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Preview-Truncated": result.partial ? "true" : "false",
        "X-Preview-Limit": String(result.object.kind === "image" ? 5 * 1024 * 1024 : MAX_STORAGE_PREVIEW_BYTES),
      },
    });
  } catch (error) {
    return storageErrorResponse(error, "Could not load Storage preview.");
  }
}
