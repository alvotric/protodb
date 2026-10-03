import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getSystemHealthSnapshot } from "@/lib/audit/health-service";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "database_unavailable", message: "Database health is unavailable because no database is configured." } },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Not signed in." } }, { status: 401 });
  }

  try {
    const snapshot = await getSystemHealthSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("Failed to read system health snapshot:", error);
    return NextResponse.json(
      { ok: false, error: { code: "health_unavailable", message: "Current database connection metrics are unavailable." } },
      { status: 503 }
    );
  }
}
