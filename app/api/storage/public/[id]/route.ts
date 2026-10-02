import { NextResponse } from "next/server";
import { getPublicDownloadUrl } from "@/lib/storage/service";
import { storageErrorResponse } from "@/lib/storage/http";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = await getPublicDownloadUrl(id);
    return NextResponse.redirect(url, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return storageErrorResponse(error, "Public Storage object is unavailable.");
  }
}
