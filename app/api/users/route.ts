import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isUsersAdmin } from "@/lib/users/user-admin-policy";
import { listAdminUsers } from "@/lib/users/user-admin-service";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "database_unavailable", message: "User management is unavailable." } },
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
    const users = await listAdminUsers();
    return NextResponse.json({ ok: true, source: "protodb_admin.users", users });
  } catch (error) {
    console.error("Failed to read the user roster:", error);
    return NextResponse.json(
      { ok: false, error: { code: "users_unavailable", message: "The user roster is temporarily unavailable." } },
      { status: 503 }
    );
  }
}
