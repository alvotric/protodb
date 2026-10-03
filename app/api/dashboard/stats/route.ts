import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/dashboard/stats-service";

/**
 * Phase 10 — Backend API & Real Data Integration.
 * Thin wrapper around lib/dashboard/stats-service.ts's real query
 * logic, for any client-side refresh later -- the Dashboard page
 * itself (a Server Component) calls that function directly rather
 * than fetching this route.
 */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Not signed in." } }, { status: 401 });
    }
    const stats = await getDashboardStats();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    console.error("Failed to read Dashboard metrics:", error);
    return NextResponse.json(
      { ok: false, error: { code: "dashboard_unavailable", message: "Dashboard metrics are temporarily unavailable." } },
      { status: 503 }
    );
  }
}
