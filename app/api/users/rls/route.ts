import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isUsersAdmin } from "@/lib/users/user-admin-policy";
import { listRlsTables } from "@/lib/users/user-admin-service";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "database_unavailable", message: "RLS metadata is unavailable." } },
      { status: 503 }
    );
  }
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Not signed in." } }, { status: 401 });
    }
    if (!isUsersAdmin(actor.role)) {
      return NextResponse.json({ ok: false, error: { code: "forbidden", message: "Owner access is required." } }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      source: "PostgreSQL catalogs visible to the configured connection",
      visibility: "Catalog results may be limited by PostgreSQL privileges.",
      tables: await listRlsTables(),
    });
  } catch (error) {
    console.error("Failed to read PostgreSQL RLS metadata:", error);
    return NextResponse.json(
      { ok: false, error: { code: "rls_unavailable", message: "RLS metadata is temporarily unavailable." } },
      { status: 503 }
    );
  }
}
