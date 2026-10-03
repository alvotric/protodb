import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";
import { validateProfileName } from "@/lib/settings/profile-policy";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  const validation = body && typeof body === "object" && !Array.isArray(body)
    ? validateProfileName((body as Record<string, unknown>).name)
    : { ok: false as const, message: "A JSON object with a name is required." };
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_profile", message: validation.message } },
      { status: 400 }
    );
  }

  try {
    await query(`update protodb_admin.users set name = $1 where id = $2`, [validation.name, user.id]);
    await logAuditEvent({
      actor: user.email,
      action: "account.profile.update",
      resource: "account.profile",
      result: "success",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await logAuditEvent({
      actor: user.email,
      action: "account.profile.update",
      resource: "account.profile",
      result: "failed",
    });
    console.error("Failed to update account profile:", error);
    return NextResponse.json(
      { ok: false, error: { code: "profile_save_failed", message: "Profile could not be saved." } },
      { status: 503 }
    );
  }
}
