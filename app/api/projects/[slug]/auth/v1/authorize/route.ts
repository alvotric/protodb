import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { GOOGLE_AUTHORIZATION_ENDPOINT } from "@/lib/auth/google";
import {
  OAUTH_STATE_TTL_SECONDS,
  generateOAuthState,
} from "@/lib/auth/google";
import { validateCodeChallenge } from "@/lib/project-auth/pkce";
import {
  encodeRequestContext,
  PAUTH_COOKIE_PATH,
  PAUTH_REQUEST_COOKIE,
  PAUTH_STATE_COOKIE,
} from "@/lib/project-auth/authorize";
import {
  matchRedirectUri,
} from "@/lib/project-auth/providers";
import { getProjectGoogleProvider, resolveProjectBySlug } from "@/lib/project-auth/projects";
import { validateProjectSlug } from "@/lib/project-auth/scope";

export const runtime = "nodejs";

const MAX_APP_STATE_LENGTH = 512;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Browser-first entry point: an external app redirects the user's
 * browser here (no server-side POST, no prior cookie needed).
 * PKCE S256, exact redirect allowlisting, and one-time codes are
 * enforced; Google secrets never leave the server.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!isDatabaseConfigured()) {
    return jsonError("Authentication service is unavailable.", 503);
  }
  let slug: string;
  try {
    slug = validateProjectSlug((await params).slug);
  } catch {
    return jsonError("Project was not found.", 404);
  }
  const project = await resolveProjectBySlug(slug).catch(() => null);
  if (!project) return jsonError("Project was not found.", 404);

  const query = new URL(req.url).searchParams;
  const provider = query.get("provider") ?? "google";
  const redirectUri = query.get("redirect_uri") ?? "";
  const challenge = query.get("code_challenge") ?? "";
  const method = query.get("code_challenge_method") ?? "";
  const appState = query.get("state");

  const fail = async (message: string, status: number, auditAction = "project.auth.authorize") => {
    await logAuditEvent({
      actor: "unknown",
      action: auditAction,
      resource: `project:${project.slug}`,
      result: "failed",
      ip: req.headers.get("x-forwarded-for") ?? "—",
    });
    return jsonError(message, status);
  };

  if (provider !== "google") return fail("Only the google provider is supported.", 400);
  if (method !== "S256") {
    return fail("code_challenge_method must be S256.", 400);
  }
  let codeChallenge: string;
  try {
    codeChallenge = validateCodeChallenge(challenge);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid code_challenge.", 400);
  }
  if (appState !== null && (typeof appState !== "string" || appState.length > MAX_APP_STATE_LENGTH)) {
    return fail("state is too long.", 400);
  }

  const providerRow = await getProjectGoogleProvider(project.id).catch(() => null);
  if (!providerRow || !providerRow.enabled) {
    return fail("Google sign-in is not enabled for this project.", 400);
  }
  if (!matchRedirectUri(providerRow.allowed_redirect_urls, redirectUri)) {
    return fail("redirect_uri is not registered for this project.", 400);
  }

  const state = generateOAuthState();
  const context = encodeRequestContext({
    projectId: project.id,
    redirectUri,
    codeChallenge,
    appState,
  });
  const googleParams = new URLSearchParams({
    response_type: "code",
    client_id: providerRow.client_id,
    redirect_uri: `${new URL(req.url).origin}/api/projects/${project.slug}/auth/v1/callback`,
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  const response = NextResponse.redirect(`${GOOGLE_AUTHORIZATION_ENDPOINT}?${googleParams.toString()}`);
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(PAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: PAUTH_COOKIE_PATH,
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  response.cookies.set(PAUTH_REQUEST_COOKIE, context, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: PAUTH_COOKIE_PATH,
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return response;
}
