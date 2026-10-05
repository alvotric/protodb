import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, queryOne, withTransaction } from "@/lib/db/client";
import { getCurrentUser, createSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";
import { randomBytes } from "node:crypto";
import {
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAuthCallbackError,
  decideGoogleLogin,
  exchangeCodeForIdToken,
  getGoogleOAuthConfig,
  parseCallbackParams,
  parseIntentCookie,
  statesEqual,
  verifyGoogleIdToken,
  type GoogleIdentity,
} from "@/lib/auth/google";

const BOOTSTRAP_LOCK_NAMESPACE = 734091;
const BOOTSTRAP_LOCK_ID = 1;

function clearOAuthCookies(response: NextResponse): void {
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_INTENT_COOKIE);
}

function loginRedirect(req: NextRequest, code: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/login?oauth=${code}`, req.url));
  clearOAuthCookies(response);
  return response;
}

function settingsRedirect(req: NextRequest, query: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/settings?${query}`, req.url));
  clearOAuthCookies(response);
  return response;
}

async function audit(action: string, actor: string, resource: string, result: "success" | "failed", req: NextRequest) {
  await logAuditEvent({
    actor,
    action,
    resource,
    result,
    ip: req.headers.get("x-forwarded-for") ?? "—",
  });
}

/**
 * Google OAuth/OIDC callback. All validation, the authorization-code
 * exchange, and identity verification happen server-side; only fixed
 * internal redirects (never tokens, codes, or secrets) leave the server.
 */
export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return loginRedirect(req, "unavailable");
  }
  const config = getGoogleOAuthConfig();
  if (!config) {
    console.error("Google OAuth callback hit without server configuration.");
    return loginRedirect(req, "unavailable");
  }

  const params = parseCallbackParams(new URL(req.url).searchParams);
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const intent = parseIntentCookie(req.cookies.get(OAUTH_INTENT_COOKIE)?.value);
  const isLink = intent?.kind === "link";

  const failRedirect = (code: string) =>
    isLink ? settingsRedirect(req, `link_error=${code}`) : loginRedirect(req, code);

  if (params.providerError) {
    await audit("auth.google.login", "unknown", "Google OAuth", "failed", req);
    return failRedirect("cancelled");
  }
  if (!expectedState || !params.state || !statesEqual(expectedState, params.state) || !intent) {
    await audit("auth.google.login", "unknown", "Google OAuth", "failed", req);
    return failRedirect("invalid-state");
  }
  if (!params.code) {
    await audit("auth.google.login", "unknown", "Google OAuth", "failed", req);
    return failRedirect("invalid-response");
  }

  let identity: GoogleIdentity;
  try {
    const idToken = await exchangeCodeForIdToken(config, params.code);
    identity = await verifyGoogleIdToken(idToken, { clientId: config.clientId });
  } catch (error) {
    console.error("Google OAuth verification failed:", error instanceof Error ? error.message : error);
    await audit("auth.google.login", "unknown", "Google OAuth", "failed", req);
    return failRedirect(error instanceof OAuthCallbackError ? "verification-failed" : "unavailable");
  }

  if (isLink) {
    return handleLink(req, intent.userId, identity);
  }
  return handleLogin(req, identity);
}

async function handleLogin(req: NextRequest, identity: GoogleIdentity): Promise<NextResponse> {
  // A database failure here must read as "unavailable", never as
  // "unknown identity" — otherwise a missing migration 005 or a down
  // database would route every Google login into bootstrap/reject paths.
  let linked: { id: string; email: string; status: string } | null;
  let emailMatch: { id: string; email: string; status: string } | null;
  let usersEmpty: boolean;
  try {
    linked = await queryOne<{ id: string; email: string; status: string }>(
      `select u.id, u.email, u.status
       from protodb_admin.user_identities i
       join protodb_admin.users u on u.id = i.user_id
       where i.provider = 'google' and i.provider_sub = $1`,
      [identity.sub]
    );
    emailMatch = await queryOne<{ id: string; email: string; status: string }>(
      `select id, email, status from protodb_admin.users where email = $1`,
      [identity.email]
    );
    usersEmpty = (await queryOne<{ count: string }>(
      `select count(*)::text as count from protodb_admin.users`
    ))?.count === "0";
  } catch (error) {
    console.error("Google login lookup failed:", error);
    return loginRedirect(req, "unavailable");
  }

  const decision = decideGoogleLogin({
    linkedUser: linked,
    emailMatchedUser: emailMatch,
    usersEmpty,
  });

  if (decision.kind === "login") {
    try {
      await createSession(decision.userId);
    } catch (error) {
      console.error("Google login session creation failed:", error);
      return loginRedirect(req, "unavailable");
    }
    await audit("auth.google.login", identity.email, "session", "success", req);
    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    clearOAuthCookies(response);
    return response;
  }

  if (decision.kind === "bootstrap") {
    return bootstrapOwner(req, identity);
  }

  // Rejections: suspended, email-conflict (never merge), no-account.
  // The redirect code tells the login page which safe message to show;
  // the conflicting/missing address itself stays server-side.
  const code = decision.reason === "suspended" ? "suspended"
    : decision.reason === "email-conflict" ? "exists" : "no-account";
  await audit("auth.google.login", identity.email, "session", "failed", req);
  return loginRedirect(req, code);
}

/** First-ever user via Google: Owner + linked identity, atomically. */
async function bootstrapOwner(req: NextRequest, identity: GoogleIdentity): Promise<NextResponse> {
  try {
    // Password login is untouched by Google; new Google-only accounts get
    // a random unusable password hash that can never verify.
    const unusablePasswordHash = `unusable:${randomBytes(32).toString("hex")}`;
    const name = (identity.name ?? identity.email.split("@")[0] ?? "Owner").slice(0, 100) || "Owner";
    const created = await withTransaction(async (client) => {
      await client.query("select pg_advisory_xact_lock($1, $2)", [
        BOOTSTRAP_LOCK_NAMESPACE,
        BOOTSTRAP_LOCK_ID,
      ]);
      const existing = await client.query<{ count: string }>(
        `select count(*)::text as count from protodb_admin.users`
      );
      if (existing.rows[0]?.count !== "0") throw new Error("setup-complete");
      const inserted = await client.query<{ id: string }>(
        `insert into protodb_admin.users (email, password_hash, name, role, status)
         values ($1, $2, $3, 'Owner', 'active')
         returning id`,
        [identity.email, unusablePasswordHash, name]
      );
      const userId = inserted.rows[0]?.id;
      if (!userId) throw new Error("owner-insert-failed");
      await client.query(
        `insert into protodb_admin.user_identities (user_id, provider, provider_sub, email)
         values ($1, 'google', $2, $3)`,
        [userId, identity.sub, identity.email]
      );
      return { id: userId };
    });
    await createSession(created.id);
    await audit("auth.google.login", identity.email, "session", "success", req);
    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "setup-complete") {
      await audit("auth.google.login", identity.email, "session", "failed", req);
      return loginRedirect(req, "exists");
    }
    console.error("Google bootstrap Owner creation failed:", error);
    return loginRedirect(req, "unavailable");
  }
}

/** Authenticated linking: binds the verified Google subject to the signed-in account. */
async function handleLink(req: NextRequest, userId: string, identity: GoogleIdentity): Promise<NextResponse> {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.id !== userId) {
    await audit("auth.google.link", identity.email, "Google identity", "failed", req);
    return settingsRedirect(req, "link_error=signin-required");
  }
  try {
    await queryOne(
      `insert into protodb_admin.user_identities (user_id, provider, provider_sub, email)
       values ($1, 'google', $2, $3)
       returning id`,
      [user.id, identity.sub, identity.email]
    );
  } catch (error) {
    console.error("Google identity linking failed:", error);
    await audit("auth.google.link", user.email, "Google identity", "failed", req);
    return settingsRedirect(req, "link_error=already-linked");
  }
  await audit("auth.google.link", user.email, "Google identity", "success", req);
  return settingsRedirect(req, "linked=google");
}
