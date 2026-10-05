import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import {
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  buildAuthorizationUrl,
  encodeIntentCookie,
  generateOAuthState,
  getGoogleOAuthConfig,
} from "@/lib/auth/google";

/**
 * Starts the Google OAuth/OIDC authorization-code flow.
 *
 * - Default (no session required): login intent.
 * - `?intent=link` (signed-in session required): links the Google
 *   identity to the current account instead of signing in.
 * Only cryptographically random state leaves the server; the client
 * secret never leaves the server (it is used solely in the callback's
 * server-side code exchange).
 */
export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?oauth=unavailable", req.url));
  }
  const config = getGoogleOAuthConfig();
  if (!config) {
    console.error("Google OAuth is not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
    return NextResponse.redirect(new URL("/login?oauth=unavailable", req.url));
  }

  const intentParam = new URL(req.url).searchParams.get("intent");
  let intentValue = encodeIntentCookie({ kind: "login" });
  if (intentParam === "link") {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      return NextResponse.redirect(new URL("/login?oauth=signin-required", req.url));
    }
    intentValue = encodeIntentCookie({ kind: "link", userId: user.id });
  }

  const state = generateOAuthState();
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  cookieStore.set(OAUTH_INTENT_COOKIE, intentValue, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(buildAuthorizationUrl(config, state));
}
