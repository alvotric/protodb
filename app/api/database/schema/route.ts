import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { listSchemaTables } from "@/lib/database/schema-service";
import { safeDbReadError } from "@/lib/database/db-error";

export async function GET(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  try {
    const includePartitioned = new URL(req.url).searchParams.get("includePartitioned") === "true";
    const tables = await listSchemaTables({ includePartitioned });
    return NextResponse.json({ ok: true, tables });
  } catch (err) {
    return safeDbReadError(err, "Failed to list tables.");
  }
}
