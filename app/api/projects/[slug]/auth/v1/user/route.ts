import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { deleteProjectUser, findPasswordUserById } from "@/lib/project-auth/passwords";
import { resolveProjectBySlug } from "@/lib/project-auth/projects";
import { validateProjectSlug } from "@/lib/project-auth/scope";
import { authenticateProjectRequest } from "@/lib/project-auth/sessions";
import { bearerTokenFromHeader } from "@/lib/project-auth/tokens";

export const runtime = "nodejs";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "invalid_token", error_description: "Access token is invalid or expired." }, { status: 401 });
}

/** Returns the calling project end-user. Bearer access token, project-scoped. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "temporarily_unavailable", error_description: "Authentication service is unavailable." }, { status: 503 });
  }
  let projectSlug: string;
  try {
    projectSlug = validateProjectSlug((await params).slug);
  } catch {
    return unauthorized();
  }
  const project = await resolveProjectBySlug(projectSlug).catch(() => null);
  if (!project) return unauthorized();
  const token = bearerTokenFromHeader(req.headers.get("authorization"));
  if (!token) return unauthorized();
  const context = await authenticateProjectRequest(project.id, token).catch(() => null);
  if (!context) return unauthorized();
  return NextResponse.json({
    user: {
      id: context.user.id,
      email: context.user.email,
      email_verified: context.user.emailVerified,
      name: context.user.name,
    },
  });
}

/**
 * Self-service account deletion (real primitive, not a stub). Bearer
 * session required. Password accounts must confirm with their current
 * password; Google-only accounts proceed on the authenticated request.
 * Revokes every session, then deletes the project user row (identities,
 * sessions, codes, and email tokens cascade). External application data
 * owned by this user is out of scope here.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "temporarily_unavailable", error_description: "Authentication service is unavailable." }, { status: 503 });
  }
  let projectSlug: string;
  try {
    projectSlug = validateProjectSlug((await params).slug);
  } catch {
    return unauthorized();
  }
  const project = await resolveProjectBySlug(projectSlug).catch(() => null);
  if (!project) return unauthorized();
  const token = bearerTokenFromHeader(req.headers.get("authorization"));
  if (!token) return unauthorized();
  const context = await authenticateProjectRequest(project.id, token).catch(() => null);
  if (!context) return unauthorized();

  let password: unknown = undefined;
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && "password" in body) {
      password = (body as { password?: unknown }).password;
    }
  } catch {
    password = undefined;
  }

  const row = await findPasswordUserById(project.id, context.user.id).catch(() => null);
  if (!row) return unauthorized();
  if (row.password_hash) {
    if (typeof password !== "string" || password.length === 0) {
      return NextResponse.json(
        { error: "password_required", error_description: "Current password is required to delete this account." },
        { status: 403 }
      );
    }
    const ok = await verifyPassword(password, row.password_hash).catch(() => false);
    if (!ok) {
      return NextResponse.json(
        { error: "password_invalid", error_description: "Current password is incorrect." },
        { status: 403 }
      );
    }
  }
  try {
    await deleteProjectUser(project.id, context.user.id);
  } catch {
    return NextResponse.json(
      { error: "server_error", error_description: "Account could not be deleted." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
