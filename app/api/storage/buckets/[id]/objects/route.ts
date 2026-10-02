import { NextRequest, NextResponse } from "next/server";
import { canReadStorage } from "@/lib/storage/policy";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { storageErrorResponse } from "@/lib/storage/http";
import { listObjects, parseStoragePage, parseStoragePageSize } from "@/lib/storage/service";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!canReadStorage(user)) return NextResponse.json({ ok: false, error: "Storage access is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const result = await listObjects({
      bucketId: id,
      folder: url.searchParams.get("folder") ?? "",
      search: url.searchParams.get("q") ?? "",
      page: parseStoragePage(url.searchParams.get("page")),
      pageSize: parseStoragePageSize(url.searchParams.get("pageSize")),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return storageErrorResponse(error, "Could not load files from this bucket.");
  }
}
