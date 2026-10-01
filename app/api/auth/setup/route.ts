import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

/**
 * Phase 10 — Backend API & Real Data Integration.
 * A fresh `protodb_admin.users` table starts empty -- there's no
 * seed data to sign in with (unlike every mock-data phase before
 * this). GET tells the login page whether to show "create the first
 * admin account" or a normal sign-in form; POST does the former,
 * exactly once -- it refuses once any user already exists, so this
 * can't be used to mint a second Owner account later.
 */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ needsSetup: false, databaseConfigured: false });
  }
  try {
    const existing = await queryOne<{ count: string }>(`select count(*)::text as count from protodb_admin.users`);
    const needsSetup = !existing || existing.count === "0";
    return NextResponse.json({ needsSetup, databaseConfigured: true });
  } catch (err) {
    return NextResponse.json(
      {
        needsSetup: false,
        databaseConfigured: true,
        error: `Couldn't reach the database. Have you run migrations/001_protodb_admin_schema.sql yet? (${err instanceof Error ? err.message : "unknown error"})`,
      },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not set." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!email || !password || !name) {
    return NextResponse.json({ ok: false, error: "Name, email, and password are all required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await queryOne<{ count: string }>(`select count(*)::text as count from protodb_admin.users`);
  if (!existing || existing.count !== "0") {
    return NextResponse.json({ ok: false, error: "Setup has already been completed." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const created = await queryOne<{ id: string }>(
    `insert into protodb_admin.users (email, password_hash, name, role, status)
     values ($1, $2, $3, 'Owner', 'active')
     returning id`,
    [email, passwordHash, name]
  );
  if (!created) {
    return NextResponse.json({ ok: false, error: "Couldn't create the account." }, { status: 500 });
  }

  await query(`insert into protodb_admin.audit_log (actor, action, resource, result, ip) values ($1, 'auth.setup', 'workspace', 'success', $2)`, [
    email,
    req.headers.get("x-forwarded-for") ?? "—",
  ]);

  await createSession(created.id);
  return NextResponse.json({ ok: true });
}
