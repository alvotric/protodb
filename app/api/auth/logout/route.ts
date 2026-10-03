import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";

export async function POST() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    console.error("Failed to resolve actor while signing out:", error);
  }
  try {
    await destroySession();
  } catch (error) {
    console.error("Failed to revoke the signed-out session:", error);
    return NextResponse.json(
      { ok: false, error: "This browser was signed out, but server-side session revocation could not be confirmed." },
      { status: 503 }
    );
  }
  if (user) {
    await logAuditEvent({
      actor: user.email,
      action: "auth.logout",
      resource: "session",
      result: "success",
    });
  }
  return NextResponse.json({ ok: true });
}
