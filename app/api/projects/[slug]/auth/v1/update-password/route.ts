import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit/log";
import { consumeEmailToken, markEmailVerified } from "@/lib/project-auth/email-tokens";
import { resetPasswordAfterRecovery, setUserPassword, validateNewPassword } from "@/lib/project-auth/passwords";
import { authRouteError, readJsonBody, requestIp, resolveProjectParam } from "@/lib/project-auth/request";
import { authenticateProjectRequest } from "@/lib/project-auth/sessions";
import { bearerTokenFromHeader } from "@/lib/project-auth/tokens";

export const runtime = "nodejs";

/**
 * Password update, two explicit modes:
 * - Session mode (Bearer access token): `{ current_password?, new_password }`.
 *   Other sessions of the user are revoked; the calling session survives.
 * - Recovery mode: `{ token, new_password }` with a valid recovery token.
 *   Recovery proves email ownership, so the email is marked verified and
 *   ALL sessions are revoked (a reset must log other devices out).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const project = await resolveProjectParam(params);
    const body = await readJsonBody(req);
    const ip = requestIp(req);

    if (typeof body.token === "string" && body.token.length > 0) {
      const userId = await consumeEmailToken(project.id, body.token, "recovery");
      if (!userId) {
        await logAuditEvent({ actor: "unknown", action: "project.auth.update-password", resource: `project:${project.slug}`, result: "failed", ip });
        return NextResponse.json(
          { ok: false, error: "invalid_token", message: "This reset link is invalid or has already been used." },
          { status: 400 }
        );
      }
      const next = validateNewPassword(body.new_password);
      await resetPasswordAfterRecovery(project.id, userId, { newPassword: next });
      await markEmailVerified(project.id, userId);
      await revokeProjectSessionFamilyForUser(project.id, userId);
      await logAuditEvent({ actor: userId, action: "project.auth.update-password", resource: `project:${project.slug}`, result: "success", ip });
      return NextResponse.json({ ok: true });
    }

    const token = bearerTokenFromHeader(req.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Sign in to change your password." },
        { status: 401 }
      );
    }
    const context = await authenticateProjectRequest(project.id, token).catch(() => null);
    if (!context) {
      return NextResponse.json(
        { ok: false, error: "invalid_token", message: "Access token is invalid or expired." },
        { status: 401 }
      );
    }
    await setUserPassword(project.id, context.user.id, {
      currentPassword: body.current_password,
      newPassword: body.new_password,
    });
    // Revoke every OTHER session; the caller stays signed in.
    await revokeOtherSessions(project.id, context.user.id, context.session.id);
    await logAuditEvent({ actor: context.user.email, action: "project.auth.update-password", resource: `project:${project.slug}`, result: "success", ip });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authRouteError(error, "Password could not be updated.");
  }
}

async function revokeProjectSessionFamilyForUser(projectId: string, userId: string): Promise<void> {
  await query(
    `update protodb_admin.project_auth_sessions
     set revoked_at = now()
     where project_id = $1 and project_user_id = $2 and revoked_at is null`,
    [projectId, userId]
  ).catch(() => []);
}

async function revokeOtherSessions(projectId: string, userId: string, keepSessionId: string): Promise<void> {
  await query(
    `update protodb_admin.project_auth_sessions
     set revoked_at = now()
     where project_id = $1 and project_user_id = $2 and id <> $3 and revoked_at is null`,
    [projectId, userId, keepSessionId]
  ).catch(() => []);
}
