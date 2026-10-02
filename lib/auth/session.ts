import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db/client";
import type { AccountStatus, AppRole } from "@/lib/auth/role-capabilities";

const SESSION_COOKIE = "protodb_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  status: AccountStatus;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Phase 10 — Backend API & Real Data Integration.
 * The session token itself is never stored anywhere -- only its
 * SHA-256 hash is, in `protodb_admin.sessions`. The cookie holds the
 * real token; a stolen database dump alone can't be replayed as a
 * valid session, same principle as password hashing.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await query(
    `insert into protodb_admin.sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt]
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`delete from protodb_admin.sessions where token_hash = $1`, [hashToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Server-side lookup of the currently signed-in user, for pages/layouts/route handlers. Returns null if there's no session, it's expired, or the account has been suspended. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<{
    id: string;
    email: string;
    name: string;
    role: SessionUser["role"];
    status: SessionUser["status"];
  }>(
    `select u.id, u.email, u.name, u.role, u.status
     from protodb_admin.sessions s
     join protodb_admin.users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)]
  );

  if (!row || row.status === "suspended") return null;

  // Best-effort activity ping -- if this write fails, the session
  // itself is still valid, so failure here shouldn't block the request.
  query(`update protodb_admin.users set last_active_at = now() where id = $1`, [row.id]).catch(() => {});

  return row;
}
