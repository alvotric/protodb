import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { canReadStorage } from "@/lib/storage/policy";
import { createDownloadUrl } from "@/lib/storage/service";
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
    const result = await createDownloadUrl(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return storageErrorResponse(error, "Could not authorize Storage download.");
  }
}
