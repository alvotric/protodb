import { NextRequest, NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/log";
import { validateRedirectUrl } from "@/lib/project-auth/providers";
import { createPasswordUser } from "@/lib/project-auth/passwords";
import { issueEmailToken } from "@/lib/project-auth/email-tokens";
import { sendProjectAuthEmail } from "@/lib/project-auth/email";
import { authRouteError, readJsonBody, requestIp, resolveProjectParam } from "@/lib/project-auth/request";
import { ProjectAuthError } from "@/lib/project-auth/scope";

export const runtime = "nodejs";

/**
 * Email/password signup. Creates an unverified user and emails a
 * single-use verification link. Duplicate emails in the same project
 * are a 409 (explicit, like Supabase); cross-project emails are
 * independent. `redirect_to` shapes the emailed link and must be a
 * well-formed HTTPS (or loopback HTTP) URL when provided.
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

    const user = await createPasswordUser(project.id, {
      email: body.email,
      password: body.password,
      name: body.name,
    });
    const token = await issueEmailToken(project.id, user.id, "verify");
    const link = redirectTo
      ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}&type=verify`
      : token;
    await sendProjectAuthEmail({
      projectId: project.id,
      userId: user.id,
      purpose: "verify",
      email: user.email,
      link,
      projectSlug: project.slug,
    });
    await logAuditEvent({ actor: user.email, action: "project.auth.signup", resource: `project:${project.slug}`, result: "success", ip });
    return NextResponse.json(
      {
        ok: true,
        user: { id: user.id, email: user.email, email_verified: false, name: user.name },
        message: "Check your inbox to confirm your email address before signing in.",
      },
      { status: 201 }
    );
  } catch (error) {
    return authRouteError(error, "Account could not be created.");
  }
}
