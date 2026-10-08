import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { validateCodeVerifier, verifyPkceChallenge } from "@/lib/project-auth/pkce";
import { authenticatePasswordUser } from "@/lib/project-auth/passwords";
import { resolveProjectBySlug } from "@/lib/project-auth/projects";
import { validateProjectSlug, ProjectAuthError } from "@/lib/project-auth/scope";
import {
  createProjectSession,
  refreshProjectSession,
} from "@/lib/project-auth/sessions";

export const runtime = "nodejs";

interface CodeRow {
  id: string;
  project_id: string;
  project_user_id: string;
  code_challenge: string;
  redirect_uri: string;
  app_state: string | null;
}

async function readJson(req: NextRequest, maxBytes = 8192): Promise<Record<string, unknown>> {
  const text = await req.text().catch(() => "");
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ProjectAuthError("Request body is too large.", 413);
  }
  try {
    const parsed: unknown = JSON.parse(text || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ProjectAuthError("Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProjectAuthError) throw error;
    throw new ProjectAuthError("Request body must be valid JSON.");
  }
}

function oauthError(error: string, description: string, status = 400): NextResponse {
  return NextResponse.json({ error, error_description: description }, { status });
}

/**
 * Token endpoint (Supabase-style). Three grants:
 * - authorization_code (+ PKCE verifier): single-use code redemption.
 * - password: email/password login (verified accounts only).
 * - refresh_token: rotation with reuse detection (replayed revoked
 *   tokens burn the whole session family).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!isDatabaseConfigured()) {
    return oauthError("temporarily_unavailable", "Authentication service is unavailable.", 503);
  }
  const projectSlug = await (async (): Promise<string | null> => {
    try {
      return validateProjectSlug((await params).slug);
    } catch {
      return null;
    }
  })();
  if (!projectSlug) return oauthError("invalid_request", "Project was not found.", 404);
  const project = await resolveProjectBySlug(projectSlug).catch(() => null);
  if (!project) return oauthError("invalid_request", "Project was not found.", 404);
  const projectId = project.id;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (error) {
    const status = error instanceof ProjectAuthError ? error.status : 400;
    return oauthError("invalid_request", error instanceof Error ? error.message : "Invalid request.", status);
  }

  const ip = req.headers.get("x-forwarded-for") ?? "—";
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const grant = body.grant_type;

  if (grant === "authorization_code") {
    return redeemCode(projectId, projectSlug, body, ip, userAgent);
  }
  if (grant === "password") {
    return passwordLogin(projectId, projectSlug, body, ip, userAgent);
  }
  if (grant === "refresh_token") {
    return rotateRefresh(projectId, projectSlug, body, ip, userAgent);
  }
  return oauthError("unsupported_grant_type", "grant_type must be authorization_code, password, or refresh_token.");
}

async function redeemCode(
  projectId: string,
  projectSlug: string,
  body: Record<string, unknown>,
  ip: string,
  userAgent: string | undefined
): Promise<NextResponse> {
  if (typeof body.code !== "string" || typeof body.redirect_uri !== "string") {
    return oauthError("invalid_request", "code and redirect_uri are required.");
  }
  let verifier: string;
  try {
    verifier = validateCodeVerifier(body.code_verifier);
  } catch (error) {
    return oauthError("invalid_request", error instanceof Error ? error.message : "Invalid code_verifier.");
  }
  const { hashProjectToken } = await import("@/lib/project-auth/tokens");
  const row = await queryOne<CodeRow>(
    `select id, project_id, project_user_id, code_challenge, redirect_uri, app_state
     from protodb_admin.project_auth_codes
     where project_id = $1 and code_hash = $2 and consumed_at is null and expires_at > now()`,
    [projectId, hashProjectToken(body.code)]
  ).catch(() => null);
  if (!row || row.redirect_uri !== body.redirect_uri || !verifyPkceChallenge(verifier, row.code_challenge)) {
    await logAuditEvent({ actor: "unknown", action: "project.auth.token", resource: `project:${projectSlug}`, result: "failed", ip });
    return oauthError("invalid_grant", "Authorization code is invalid or expired.", 400);
  }
  // Atomic single redemption: exactly one requester wins the consume race.
  const consumed = await query<{ id: string }>(
    `update protodb_admin.project_auth_codes
     set consumed_at = now()
     where id = $1 and consumed_at is null
     returning id`,
    [row.id]
  ).catch(() => []);
  if (!consumed[0]) {
    await logAuditEvent({ actor: "unknown", action: "project.auth.token", resource: `project:${projectSlug}`, result: "failed", ip });
    return oauthError("invalid_grant", "Authorization code was already used.", 400);
  }
  const tokens = await createProjectSession({
    projectId,
    userId: row.project_user_id,
    ip,
    userAgent,
  }).catch(() => null);
  if (!tokens) return oauthError("temporarily_unavailable", "Session could not be created.", 503);
  const user = await queryOne<{ email: string }>(
    `select email from protodb_admin.project_auth_users where id = $1`,
    [row.project_user_id]
  );
  await logAuditEvent({ actor: user?.email ?? "unknown", action: "project.auth.token", resource: `project:${projectSlug}`, result: "success", ip });
  return NextResponse.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    user: { id: row.project_user_id, email: user?.email ?? null },
  });
}

async function passwordLogin(
  projectId: string,
  projectSlug: string,
  body: Record<string, unknown>,
  ip: string,
  userAgent: string | undefined
): Promise<NextResponse> {
  let user;
  try {
    user = await authenticatePasswordUser(projectId, body.email, body.password);
  } catch (error) {
    const code =
      error instanceof ProjectAuthError
        ? (error.code ?? "invalid_grant")
        : "invalid_grant";
    const status = error instanceof ProjectAuthError ? error.status : 401;
    const message = error instanceof Error ? error.message : "Incorrect email or password.";
    await logAuditEvent({ actor: "unknown", action: "project.auth.token-password", resource: `project:${projectSlug}`, result: "failed", ip });
    return oauthError(code, message, status);
  }
  const tokens = await createProjectSession({
    projectId,
    userId: user.id,
    ip,
    userAgent,
  }).catch(() => null);
  if (!tokens) return oauthError("temporarily_unavailable", "Session could not be created.", 503);
  await logAuditEvent({ actor: user.email, action: "project.auth.token-password", resource: `project:${projectSlug}`, result: "success", ip });
  return NextResponse.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    user: { id: user.id, email: user.email },
  });
}

async function rotateRefresh(
  projectId: string,
  projectSlug: string,
  body: Record<string, unknown>,
  ip: string,
  userAgent: string | undefined
): Promise<NextResponse> {
  if (typeof body.refresh_token !== "string") {
    return oauthError("invalid_request", "refresh_token is required.");
  }
  const outcome = await refreshProjectSession(projectId, body.refresh_token, { ip, userAgent }).catch(() => null);
  if (!outcome || outcome.kind === "invalid") {
    await logAuditEvent({ actor: "unknown", action: "project.auth.refresh", resource: `project:${projectSlug}`, result: "failed", ip });
    return oauthError("invalid_grant", "Refresh token is invalid or expired.", 401);
  }
  return NextResponse.json({
    access_token: outcome.tokens.accessToken,
    refresh_token: outcome.tokens.refreshToken,
    token_type: "Bearer",
    expires_in: outcome.tokens.expiresIn,
    user: { id: outcome.tokens.session.userId },
  });
}
