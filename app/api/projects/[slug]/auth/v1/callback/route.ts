import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, query } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import {
  OAuthCallbackError,
  exchangeCodeForIdToken,
  statesEqual,
  verifyGoogleIdToken,
  type GoogleIdentity,
} from "@/lib/auth/google";
import {
  PAUTH_COOKIE_PATH,
  PAUTH_REQUEST_COOKIE,
  PAUTH_STATE_COOKIE,
  parseRequestContext,
} from "@/lib/project-auth/authorize";
import {
  decryptGoogleClientSecret,
  matchRedirectUri,
} from "@/lib/project-auth/providers";
import { getProjectGoogleProvider, resolveProjectBySlug } from "@/lib/project-auth/projects";
import { validateProjectSlug } from "@/lib/project-auth/scope";
import { PROJECT_AUTH_CODE_TTL_SECONDS, generateProjectToken, hashProjectToken } from "@/lib/project-auth/tokens";
import { resolveProjectGoogleUser } from "@/lib/project-auth/users";
import { ProjectAuthError } from "@/lib/project-auth/scope";

export const runtime = "nodejs";

function clearCookies(response: NextResponse): void {
  response.cookies.delete({ name: PAUTH_STATE_COOKIE, path: PAUTH_COOKIE_PATH });
  response.cookies.delete({ name: PAUTH_REQUEST_COOKIE, path: PAUTH_COOKIE_PATH });
}

function appError(redirectUri: string, appState: string | null, error: string): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (appState) url.searchParams.set("state", appState);
  const response = NextResponse.redirect(url);
  clearCookies(response);
  return response;
}

function jsonError(message: string, status: number): NextResponse {
  const response = NextResponse.json({ ok: false, error: message }, { status });
  clearCookies(response);
  return response;
}

async function audit(projectSlug: string, actor: string, result: "success" | "failed", req: NextRequest) {
  await logAuditEvent({
    actor,
    action: "project.auth.login",
    resource: `project:${projectSlug}`,
    result,
    ip: req.headers.get("x-forwarded-for") ?? "—",
  });
}

/**
 * Project Google callback. Validates the OAuth round-trip, exchanges the
 * code with the PROJECT's own encrypted secret, verifies the ID token
 * against the PROJECT's client ID, provisions the project user, and
 * issues a one-time authorization code back to the external app.
 * Only fixed internal logic and the allowlisted app redirect leave here.
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

  const query_ = new URL(req.url).searchParams;
  const requestCtx = parseRequestContext(req.cookies.get(PAUTH_REQUEST_COOKIE)?.value);
  const expectedState = req.cookies.get(PAUTH_STATE_COOKIE)?.value;
  const state = query_.get("state");

  // The request context (including which redirect is trusted) is only
  // usable after it proves itself: project match + state match first.
  if (!requestCtx || !expectedState || !state || !statesEqual(expectedState, state)) {
    return jsonError("Google sign-in request could not be verified.", 400);
  }
  const project = await resolveProjectBySlug(slug).catch(() => null);
  if (!project || project.id !== requestCtx.projectId) {
    return jsonError("Project was not found.", 404);
  }
  const providerRow = await getProjectGoogleProvider(project.id).catch(() => null);
  if (!providerRow || !providerRow.enabled) {
    return jsonError("Google sign-in is not enabled for this project.", 400);
  }
  // Re-validate the redirect against CURRENT allowlist state: cookie
  // values are never trusted for where tokens/codes may go.
  if (!matchRedirectUri(providerRow.allowed_redirect_urls, requestCtx.redirectUri)) {
    await audit(project.slug, "unknown", "failed", req);
    return jsonError("redirect_uri is not registered for this project.", 400);
  }
  const failToApp = (error: string) =>
    appError(requestCtx.redirectUri, requestCtx.appState, error);

  if (query_.get("error")) {
    await audit(project.slug, "unknown", "failed", req);
    return failToApp("access_denied");
  }
  const code = query_.get("code");
  if (!code) {
    await audit(project.slug, "unknown", "failed", req);
    return failToApp("invalid_request");
  }

  let clientSecret: string;
  try {
    clientSecret = decryptGoogleClientSecret(providerRow.client_secret_enc);
  } catch (error) {
    console.error("Project Google secret unavailable:", error instanceof Error ? error.message : error);
    await audit(project.slug, "unknown", "failed", req);
    return failToApp("temporarily_unavailable");
  }

  let identity: GoogleIdentity;
  try {
    const callbackUrl = `${new URL(req.url).origin}/api/projects/${project.slug}/auth/v1/callback`;
    const idToken = await exchangeCodeForIdToken(
      { clientId: providerRow.client_id, clientSecret, redirectUri: callbackUrl },
      code
    );
    identity = await verifyGoogleIdToken(idToken, { clientId: providerRow.client_id });
  } catch (error) {
    console.error("Project Google verification failed:", error instanceof Error ? error.message : error);
    await audit(project.slug, "unknown", "failed", req);
    return failToApp(error instanceof OAuthCallbackError ? "access_denied" : "temporarily_unavailable");
  } finally {
    clientSecret = "";
  }

  let userId: string;
  try {
    const resolved = await resolveProjectGoogleUser(project.id, identity);
    userId = resolved.user.id;
  } catch (error) {
    await audit(project.slug, identity.email, "failed", req);
    if (error instanceof ProjectAuthError && error.status === 403) return failToApp("access_denied");
    return failToApp("server_error");
  }

  const appCode = generateProjectToken();
  try {
    await query(
      `insert into protodb_admin.project_auth_codes
         (project_id, project_user_id, code_hash, code_challenge, redirect_uri, app_state, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))`,
      [
        project.id,
        userId,
        hashProjectToken(appCode),
        requestCtx.codeChallenge,
        requestCtx.redirectUri,
        requestCtx.appState,
        PROJECT_AUTH_CODE_TTL_SECONDS,
      ]
    );
  } catch (error) {
    console.error("Project authorization code issuance failed:", error);
    await audit(project.slug, identity.email, "failed", req);
    return failToApp("server_error");
  }

  await audit(project.slug, identity.email, "success", req);
  const url = new URL(requestCtx.redirectUri);
  url.searchParams.set("code", appCode);
  if (requestCtx.appState) url.searchParams.set("state", requestCtx.appState);
  const response = NextResponse.redirect(url);
  clearCookies(response);
  return response;
}
