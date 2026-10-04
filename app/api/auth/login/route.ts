import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";
import { AuthInputError, normalizeEmail, parseAuthRequest, validateAuthPassword } from "@/lib/auth/input-policy";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Sign-in is unavailable." }, { status: 503 });
  }

  let email: string;
  let password: string;
  try {
    const body = await parseAuthRequest(req);
    if (Object.keys(body).some((key) => !["email", "password"].includes(key))) {
      throw new AuthInputError("Only email and password fields are accepted.");
    }
    email = normalizeEmail(body.email);
    password = validateAuthPassword(body.password);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 }
    );
  }

  const ip = req.headers.get("x-forwarded-for") ?? "—";
  try {
    const user = await queryOne<{ id: string; password_hash: string; status: string }>(
      `select id, password_hash, status from protodb_admin.users where email = $1`,
      [email]
    );
    // Constant-work verification: always run scrypt exactly once so a missing
    // account (fast 401) cannot be distinguished from a wrong password (slow
    // 401) by response timing. The dummy hash is a valid salt:key shape and is
    // never accepted as a real credential.
    const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;
    const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

    if (!user || !valid) {
      await logAuditEvent({ actor: email, action: "auth.login", resource: "session", result: "failed", ip });
      return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
    }

    if (user.status === "suspended") {
      await logAuditEvent({ actor: email, action: "auth.login", resource: "session", result: "failed", ip });
      return NextResponse.json({ ok: false, error: "This account is unavailable." }, { status: 403 });
    }

    if (user.status === "invited") {
      await query(`update protodb_admin.users set status = 'active' where id = $1`, [user.id]);
    }
    await createSession(user.id);
    await logAuditEvent({ actor: email, action: "auth.login", resource: "session", result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Sign-in operation failed:", error);
    return NextResponse.json(
      { ok: false, error: "Sign-in could not be completed. Please try again." },
      { status: 503 }
    );
  }
}
