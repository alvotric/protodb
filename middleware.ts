import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 10 — Backend API & Real Data Integration.
 *
 * Middleware runs on the Edge runtime, which can't use the `pg`
 * driver (it needs Node's TCP APIs, unavailable there) -- so this
 * only checks whether the session COOKIE exists, not whether it's
 * still valid in the database. That real check
 * (lib/auth/session.ts#getCurrentUser, which does query the DB) runs
 * in each protected page itself; this middleware's job is just to
 * avoid rendering a page at all for someone with no cookie whatsoever,
 * and to keep a signed-in user from landing back on /login.
 */
const PUBLIC_PATHS = ["/login"];
const SESSION_COOKIE = "protodb_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Every API route (not just /api/auth/*) checks auth itself via
  // getCurrentUser() and returns a proper 401 JSON response -- a
  // redirect here would hand a client-side fetch() call an HTML
  // response instead of the JSON it expects.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (!hasSessionCookie && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
