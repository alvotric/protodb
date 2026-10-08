import { NextRequest, NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/log";
import { consumeEmailToken, markEmailVerified } from "@/lib/project-auth/email-tokens";
import { findPasswordUserById } from "@/lib/project-auth/passwords";
import { authRouteError, readJsonBody, requestIp, resolveProjectParam } from "@/lib/project-auth/request";

export const runtime = "nodejs";

/** Consumes a verification token exactly once and marks the email verified. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const project = await resolveProjectParam(params);
    const body = await readJsonBody(req);
    const ip = requestIp(req);
    const userId = await consumeEmailToken(project.id, body.token, "verify");
    if (!userId) {
      await logAuditEvent({ actor: "unknown", action: "project.auth.verify", resource: `project:${project.slug}`, result: "failed", ip });
      return NextResponse.json(
        { ok: false, error: "invalid_token", message: "This verification link is invalid or has already been used." },
        { status: 400 }
      );
    }
    await markEmailVerified(project.id, userId);
    const verified = await findPasswordUserById(project.id, userId).catch(() => null);
    await logAuditEvent({ actor: verified?.email ?? userId, action: "project.auth.verify", resource: `project:${project.slug}`, result: "success", ip });
    return NextResponse.json({
      ok: true,
      user: { id: userId, email: verified?.email ?? null, email_verified: true },
    });
  } catch (error) {
    return authRouteError(error, "Email could not be verified.");
  }
}
