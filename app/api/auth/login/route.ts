import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not set." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "—";
  const user = await queryOne<{ id: string; password_hash: string; status: string }>(
    `select id, password_hash, status from protodb_admin.users where email = $1`,
    [email]
  );

  const valid = user ? await verifyPassword(password, user.password_hash) : false;

  if (!user || !valid) {
    await query(`insert into protodb_admin.audit_log (actor, action, resource, result, ip) values ($1, 'auth.login', 'session', 'failed', $2)`, [
      email || "unknown",
      ip,
    ]);
    return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
  }

  if (user.status === "suspended") {
    return NextResponse.json({ ok: false, error: "This account has been suspended." }, { status: 403 });
  }

  await createSession(user.id);
  await query(`insert into protodb_admin.audit_log (actor, action, resource, result, ip) values ($1, 'auth.login', 'session', 'success', $2)`, [
    email,
    ip,
  ]);

  // An invited user's first successful login is what activates them.
  if (user.status === "invited") {
    await query(`update protodb_admin.users set status = 'active' where id = $1`, [user.id]);
  }

  return NextResponse.json({ ok: true });
}
