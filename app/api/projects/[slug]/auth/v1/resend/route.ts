import { NextRequest, NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/log";
import { issueEmailToken } from "@/lib/project-auth/email-tokens";
import { sendProjectAuthEmail } from "@/lib/project-auth/email";
import { findPasswordUserRow, normalizeEmail } from "@/lib/project-auth/passwords";
import { validateRedirectUrl } from "@/lib/project-auth/providers";
import { authRouteError, readJsonBody, requestIp, resolveProjectParam } from "@/lib/project-auth/request";
import { ProjectAuthError } from "@/lib/project-auth/scope";

export const runtime = "nodejs";

/**
 * Resends the verification email. Always succeeds from the caller's
 * perspective: unknown, already-verified, or suspended addresses get
 * `{ ok: true }` without an email.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const project = await resolveProjectParam(params);
    const body = await readJsonBody(req);
    const ip = requestIp(req);

    let redirectTo: string | null = null;
    if (body.redirect_to !== undefined && body.redirect_to !== null && body.redirect_to !== "") {
      try {
        redirectTo = validateRedirectUrl(body.redirect_to);
      } catch {
        throw new ProjectAuthError("redirect_to must be a valid HTTPS (or loopback HTTP) URL.");
      }
    }

    let email: string | null = null;
    try {
      email = normalizeEmail(body.email);
    } catch {
      email = null;
    }
    if (email) {
      const row = await findPasswordUserRow(project.id, email).catch(() => null);
      if (row && row.status === "active" && !row.email_verified) {
        const token = await issueEmailToken(project.id, row.id, "verify");
        const link = redirectTo
          ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}&type=verify`
          : token;
        await sendProjectAuthEmail({
          projectId: project.id,
          userId: row.id,
          purpose: "verify",
          email: row.email,
          link,
          projectSlug: project.slug,
        });
        await logAuditEvent({ actor: row.email, action: "project.auth.resend", resource: `project:${project.slug}`, result: "success", ip });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authRouteError(error, "Verification email could not be resent.");
  }
}
